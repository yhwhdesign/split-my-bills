import { prisma } from "@/lib/prisma";
import {
  planBillSplit,
  pickSplitDates,
  pickSplitDatesForCurrentMonth,
  occurrenceFundedByGroup,
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
  bill: {
    id: string;
    dueDate: number;
    amount: number;
    fundingModel: "BEFORE_DUE" | "NEXT_CHECK";
  },
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
    // MUST use the same fundingModel-aware attribution logic used
    // everywhere else a group's dates need interpreting (isOverdue in
    // GET /api/bills), or the two systems will disagree about which
    // cycle a group belongs to.
    const fundedDueDate = occurrenceFundedByGroup(bill.dueDate, bill.fundingModel, maxLegDate);
    if (!lastFundedDueDate || fundedDueDate > lastFundedDueDate) {
      lastFundedDueDate = fundedDueDate;
    }
  }

  const windowEnd = new Date();
  windowEnd.setUTCDate(windowEnd.getUTCDate() + windowDays);

  // If no split has ever existed for this bill, the FIRST one must target
  // the current cycle's occurrence — whether it's already past or still
  // upcoming — not skip forward to next month just because today happens
  // to be past the due date. Once a real first split exists, walking
  // forward month-by-month (below) is correct recurring behavior.
  const nextTarget = lastFundedDueDate
    ? new Date(lastFundedDueDate)
    : getCurrentOccurrence(bill.dueDate);
  if (lastFundedDueDate) nextTarget.setUTCMonth(nextTarget.getUTCMonth() + 1);

  const created: { splitGroupId: string }[] = [];

  while (nextTarget <= windowEnd) {
    // NEXT_CHECK bills are funded by whatever real paydays land WITHIN
    // that same calendar month — not by paydays before the numeric due
    // date, which is what BEFORE_DUE bills use.
    const [firstDate, secondDate] =
      bill.fundingModel === "NEXT_CHECK"
        ? pickSplitDatesForCurrentMonth(nextTarget, incomeSources)
        : pickSplitDates(nextTarget, incomeSources);

    const splitGroupId = crypto.randomUUID();
    const half = bill.amount / 2;

    // A unique DB constraint (billId, paidDate, isSplitPayment) is the
    // real safeguard against duplicates — the dashboard fires multiple
    // requests at once, and Next.js dev mode can genuinely double-invoke
    // requests, so an application-level "check first" pattern is racy and
    // was proven NOT sufficient. Instead: just attempt the create, and if
    // the database rejects it as a duplicate (P2002), that means a
    // concurrent request already created this exact cycle — treat that as
    // success and move on, rather than as an error.
    try {
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
    } catch (err: any) {
      if (err?.code !== "P2002") {
        throw err;
      }
      // P2002 = unique constraint violation = a concurrent request already
      // created this cycle. Not an error — just move on to the next month.
    }

    nextTarget.setUTCMonth(nextTarget.getUTCMonth() + 1);
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

  if (!isSplittable) return;

  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill || bill.userId !== userId) return;

  const incomeSources = await prisma.incomeSource.findMany({ where: { userId } });
  if (incomeSources.length === 0) {
    console.error("regenerateSplitsIfNeeded: no income source found for user", userId);
    return;
  }

  const incomeInputs: IncomeSourceInput[] = incomeSources.map((i) => ({
    amount: Number(i.amount),
    paySchedule: i.frequency as PaySchedule,
    anchorDate: i.nextPayDate,
  }));

  // IMPORTANT: this calls ensureRecurringSplits(), NOT createBillSplit().
  // createBillSplit() always blindly targets "today's calendar month" with
  // zero awareness of what's already been funded — fine for a genuinely
  // brand-new bill, but WRONG for a repair on a bill that already has real
  // paid history beyond the current month. Calling ensureRecurringSplits()
  // here means the repair path correctly looks at whatever PAID history
  // survived the deletion above and advances PAST it.
  try {
    await ensureRecurringSplits(
      {
        id: bill.id,
        dueDate: bill.dueDate,
        amount: Number(bill.amount),
        fundingModel: bill.fundingModel,
      },
      incomeInputs
    );
  } catch (err) {
    console.error("regenerateSplitsIfNeeded: split generation failed:", err);
  }
}