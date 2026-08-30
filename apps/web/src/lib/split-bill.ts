import { prisma } from "@/lib/prisma";
import {
  planBillSplit,
  pickSplitDates,
  nextOccurrenceOnOrAfter,
  getCurrentOccurrence,
  type PaySchedule,
  type Bill,
  type IncomeSourceInput,
} from "@split-my-bills/shared";

export async function createBillSplit(billId: string, userId: string) {
  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill || bill.userId !== userId) {
    throw new Error("Bill not found");
  }
  if (!bill.splittable) {
    throw new Error("Bill is not splittable");
  }

  const incomeSources = await prisma.incomeSource.findMany({ where: { userId } });
  if (incomeSources.length === 0) {
    throw new Error("No income source found");
  }

  const incomeInputs: IncomeSourceInput[] = incomeSources.map((i) => ({
    amount: Number(i.amount),
    paySchedule: i.frequency as PaySchedule,
    anchorDate: i.nextPayDate,
  }));

  const sharedBill: Bill = {
    id: bill.id,
    name: bill.name,
    amount: Number(bill.amount),
    dueDate: bill.dueDate,
    splittable: bill.splittable,
    fundingModel: bill.fundingModel,
    isRecurring: bill.isRecurring,
  };

  const plan = planBillSplit(sharedBill, incomeInputs);

  const splitGroupId = crypto.randomUUID();

  const [firstPayment, secondPayment] = await prisma.$transaction([
    prisma.payment.create({
      data: {
        billId,
        amount: plan.firstPayment.amount,
        status: "SCHEDULED",
        isSplitPayment: true,
        splitGroupId,
        paidDate: plan.firstPayment.date,
        isLate: plan.firstPayment.isLate,
      },
    }),
    prisma.payment.create({
      data: {
        billId,
        amount: plan.secondPayment.amount,
        status: "SCHEDULED",
        isSplitPayment: true,
        splitGroupId,
        paidDate: plan.secondPayment.date,
        isLate: plan.secondPayment.isLate,
      },
    }),
  ]);

  return { firstPayment, secondPayment, splitGroupId };
}

export async function ensureRecurringSplits(
  bill: { id: string; dueDate: number; amount: number },
  incomeSources: IncomeSourceInput[],
  windowDays: number = 60
) {
  const existingLegs = await prisma.payment.findMany({
    where: { billId: bill.id, isSplitPayment: true },
  });

  const groups = new Map<string, Date[]>();
  for (const leg of existingLegs) {
    if (!leg.paidDate || !leg.splitGroupId) continue;
    const dates = groups.get(leg.splitGroupId) ?? [];
    dates.push(leg.paidDate);
    groups.set(leg.splitGroupId, dates);
  }

  let lastFundedDueDate: Date | null = null;
  for (const dates of groups.values()) {
    const maxLegDate = new Date(Math.max(...dates.map((d) => d.getTime())));
    const fundedDueDate = nextOccurrenceOnOrAfter(bill.dueDate, maxLegDate);
    if (!lastFundedDueDate || fundedDueDate > lastFundedDueDate) {
      lastFundedDueDate = fundedDueDate;
    }
  }

  const windowEnd = new Date();
  windowEnd.setDate(windowEnd.getDate() + windowDays);

  // If no split has ever existed for this bill, the FIRST one must target
  // the current cycle's occurrence — whether it's already past or still
  // upcoming — not skip forward to next month just because today happens
  // to be past the due date. Once a real first split exists, walking
  // forward month-by-month (below) is correct recurring behavior.
  const nextTarget = lastFundedDueDate
    ? new Date(lastFundedDueDate)
    : getCurrentOccurrence(bill.dueDate);
  if (lastFundedDueDate) nextTarget.setMonth(nextTarget.getMonth() + 1);

  const created: { splitGroupId: string }[] = [];

  while (nextTarget <= windowEnd) {
    const [firstDate, secondDate] = pickSplitDates(nextTarget, incomeSources);
    const splitGroupId = crypto.randomUUID();
    const half = bill.amount / 2;

    await prisma.$transaction([
      prisma.payment.create({
        data: {
          billId: bill.id,
          amount: half,
          status: "SCHEDULED",
          isSplitPayment: true,
          splitGroupId,
          paidDate: firstDate,
          isLate: firstDate > nextTarget,
        },
      }),
      prisma.payment.create({
        data: {
          billId: bill.id,
          amount: half,
          status: "SCHEDULED",
          isSplitPayment: true,
          splitGroupId,
          paidDate: secondDate,
          isLate: secondDate > nextTarget,
        },
      }),
    ]);

    created.push({ splitGroupId });
    nextTarget.setMonth(nextTarget.getMonth() + 1);
  }

  return created;
}

export async function regenerateSplitsIfNeeded(
  billId: string,
  userId: string,
  isSplittable: boolean
) {
  // Always clear out unpaid split legs — a structural change means "start over."
  // Paid legs are historical fact and are never touched.
  await prisma.payment.deleteMany({
    where: {
      billId,
      isSplitPayment: true,
      status: "SCHEDULED",
    },
  });

  if (isSplittable) {
    try {
      await createBillSplit(billId, userId);
    } catch (err) {
      // Same tolerant handling as bill creation — e.g. no income source yet.
      console.error("regenerateSplitsIfNeeded: split creation failed:", err);
    }
  }
}