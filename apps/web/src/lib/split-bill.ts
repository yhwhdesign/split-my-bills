import { prisma } from "@/lib/prisma";
//import { planBillSplit, type Bill, type PaySchedule } from "@split-my-bills/shared";
import { planBillSplit, pickSplitDates, nextOccurrenceOnOrAfter, type PaySchedule, type Bill } from "@split-my-bills/shared";

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
  const primaryIncome = incomeSources[0];

  const sharedBill: Bill = {
    id: bill.id,
    name: bill.name,
    amount: Number(bill.amount),
    dueDate: bill.dueDate,
    splittable: bill.splittable,
    fundingModel: bill.fundingModel,
  };

  const plan = planBillSplit(
    sharedBill,
    primaryIncome.frequency as PaySchedule,
    primaryIncome.nextPayDate
  );

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
  paySchedule: PaySchedule,
  anchorDate: Date,
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

  const nextTarget = lastFundedDueDate
    ? new Date(lastFundedDueDate)
    : nextOccurrenceOnOrAfter(bill.dueDate, new Date());
  if (lastFundedDueDate) nextTarget.setMonth(nextTarget.getMonth() + 1);

  const created: { splitGroupId: string }[] = [];

  while (nextTarget <= windowEnd) {
    const [firstDate, secondDate] = pickSplitDates(nextTarget, paySchedule, anchorDate);
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