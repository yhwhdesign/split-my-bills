// Shared types used across web and (eventually) other apps in the monorepo

export type PaySchedule = "WEEKLY" | "BIWEEKLY" | "SEMIMONTHLY" | "MONTHLY";

export interface Bill {
  id: string;
  name: string;
  amount: number;
  dueDate: number; // day of month, 1-31
  splittable: boolean;
  fundingModel: "BEFORE_DUE" | "NEXT_CHECK";
}

export function isCashflowRisk(bill: Bill, availableIncome: number): boolean {
  return bill.amount > availableIncome;
}

export function getUpcomingPayDates(
  paySchedule: PaySchedule,
  anchorDate: Date,
  windowDays: number = 60,
  includeMostRecentPast: boolean = false
): Date[] {
  const payDates: Date[] = [];
  const today = new Date();
  const endWindow = new Date(today);
  endWindow.setDate(endWindow.getDate() + windowDays);

  let current = new Date(anchorDate);
  let lastBeforeToday: Date | null = null;

  while (current < today) {
    lastBeforeToday = new Date(current);
    current = advancePayDate(current, paySchedule);
  }

  if (includeMostRecentPast && lastBeforeToday) {
    payDates.push(lastBeforeToday);
  }

  while (current <= endWindow) {
    payDates.push(new Date(current));
    current = advancePayDate(current, paySchedule);
  }

  return payDates;
}

export interface PayMonthGroup {
  month: string; // e.g. "2026-08"
  payDates: Date[];
  isThreePaycheckMonth: boolean;
}

export function groupPayDatesByMonth(payDates: Date[]): PayMonthGroup[] {
  const groups = new Map<string, Date[]>();

  for (const date of payDates) {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(date);
  }

  return Array.from(groups.entries()).map(([month, dates]) => ({
    month,
    payDates: dates,
    isThreePaycheckMonth: dates.length >= 3,
  }));
}

function advancePayDate(date: Date, schedule: PaySchedule): Date {
  const next = new Date(date);

  switch (schedule) {
    case "WEEKLY":
      next.setDate(next.getDate() + 7);
      break;
    case "BIWEEKLY":
      next.setDate(next.getDate() + 14);
      break;
    case "MONTHLY":
      next.setMonth(next.getMonth() + 1);
      break;
    case "SEMIMONTHLY":
      // Semimonthly is trickier — typically the 1st and 15th of each month,
      // not a fixed number of days apart. We advance by ~15 days as an approximation,
      // then snap to whichever is closer: the 1st or the 15th.
      if (next.getDate() < 15) {
        next.setDate(15);
      } else {
        next.setMonth(next.getMonth() + 1);
        next.setDate(1);
      }
      break;
  }

  return next;
}

function retreatPayDate(date: Date, schedule: PaySchedule): Date {
  const prev = new Date(date);
  switch (schedule) {
    case "WEEKLY":
      prev.setDate(prev.getDate() - 7);
      break;
    case "BIWEEKLY":
      prev.setDate(prev.getDate() - 14);
      break;
    case "MONTHLY":
      prev.setMonth(prev.getMonth() - 1);
      break;
    case "SEMIMONTHLY":
      if (prev.getDate() > 1 && prev.getDate() <= 15) {
        prev.setMonth(prev.getMonth() - 1);
        prev.setDate(1);
      } else {
        prev.setDate(15);
      }
      break;
  }
  return prev;
}

export function projectBillDueDates(dueDate: number, windowDays: number = 60): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  const endWindow = new Date(today);
  endWindow.setDate(endWindow.getDate() + windowDays);

  const cursor = new Date(today.getFullYear(), today.getMonth(), dueDate);
  if (cursor < today) cursor.setMonth(cursor.getMonth() + 1);

  while (cursor <= endWindow) {
    dates.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return dates;
}

export interface PayPeriod {
  start: Date;
  end: Date;
  payDate: Date;
  income: number;
  isThreePaycheckMonth: boolean;
  bills: { bill: Bill; dueDate: Date }[];
  totalBillAmount: number;
  isCashflowRisk: boolean;
  shortfall: number;
}

export interface SplitPaymentOverride {
  billId: string;
  billName: string;
  payments: { date: Date; amount: number }[];
}

export interface PaidOccurrence {
  billId: string;
  date: Date;
}

export function calculatePayPeriods(
  incomeAmount: number,
  paySchedule: PaySchedule,
  anchorDate: Date,
  bills: Bill[],
  windowDays: number = 60,
  splitOverrides: SplitPaymentOverride[] = [],
  paidOccurrences: PaidOccurrence[] = []
): PayPeriod[] {
  const payDates = getUpcomingPayDates(paySchedule, anchorDate, windowDays, true);
  const monthGroups = groupPayDatesByMonth(payDates);

  const threePaycheckMonthKeys = new Set(
    monthGroups.filter((g) => g.isThreePaycheckMonth).map((g) => g.month)
  );

  const overriddenBillIds = new Set(splitOverrides.map((o) => o.billId));

  const isPaidOccurrence = (billId: string, date: Date) =>
    paidOccurrences.some(
      (p) =>
        p.billId === billId &&
        p.date.getFullYear() === date.getFullYear() &&
        p.date.getMonth() === date.getMonth() &&
        p.date.getDate() === date.getDate()
    );

  const billDueDates = bills
    .filter((bill) => !overriddenBillIds.has(bill.id))
    .map((bill) => ({
      bill,
      dates: projectBillDueDates(bill.dueDate, windowDays),
    }));

  const periods: PayPeriod[] = [];

  for (let i = 0; i < payDates.length; i++) {
    const start = payDates[i];
    const end =
      i + 1 < payDates.length
        ? payDates[i + 1]
        : new Date(start.getTime() + 1000 * 60 * 60 * 24 * 30);

    const monthKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;

    const billsInPeriod: { bill: Bill; dueDate: Date }[] = [];

    for (const { bill, dates } of billDueDates) {
      for (const d of dates) {
        if (isPaidOccurrence(bill.id, d)) continue;

        if (bill.fundingModel === "NEXT_CHECK") {
          const fundingPayDate = payDates.find((pd) => pd >= d);
          if (fundingPayDate && fundingPayDate >= start && fundingPayDate < end) {
            billsInPeriod.push({ bill, dueDate: d });
          }
        } else {
          if (d >= start && d < end) {
            billsInPeriod.push({ bill, dueDate: d });
          }
        }
      }
    }

    for (const override of splitOverrides) {
      for (const payment of override.payments) {
        if (payment.date >= start && payment.date < end) {
          billsInPeriod.push({
            bill: {
              id: override.billId,
              name: `${override.billName} (split payment)`,
              amount: payment.amount,
              dueDate: payment.date.getDate(),
              splittable: false,
              fundingModel: "BEFORE_DUE",
            },
            dueDate: payment.date,
          });
        }
      }
    }

    const totalBillAmount = billsInPeriod.reduce((sum, b) => sum + b.bill.amount, 0);
    const shortfall = totalBillAmount - incomeAmount;

    periods.push({
      start,
      end,
      payDate: start,
      income: incomeAmount,
      isThreePaycheckMonth: threePaycheckMonthKeys.has(monthKey),
      bills: billsInPeriod,
      totalBillAmount,
      isCashflowRisk: shortfall > 0,
      shortfall: Math.max(0, shortfall),
    });
  }

  return periods;
}

export function normalizeToMonthly(amount: number, frequency: PaySchedule): number {
  switch (frequency) {
    case "WEEKLY":
      return (amount * 52) / 12;
    case "BIWEEKLY":
      return (amount * 26) / 12;
    case "SEMIMONTHLY":
      return amount * 2;
    case "MONTHLY":
      return amount;
  }
}

export interface SplitSuggestion {
  billId: string;
  billName: string;
  billAmount: number;
  periodStart: Date;
  currentShortfall: number;
  splitAmount: number;
  wouldResolve: boolean;
  reasoning: string;
}

export function generateSplitSuggestions(periods: PayPeriod[]): SplitSuggestion[] {
  const suggestions: SplitSuggestion[] = [];

  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];
    if (!period.isCashflowRisk) continue;

    const nextPeriod = periods[i + 1];

    for (const { bill } of period.bills) {
      if (!bill.splittable) continue;

      const splitAmount = bill.amount / 2;
      const newShortfall = period.shortfall - splitAmount;
      const wouldResolve = newShortfall <= 0;

      let reasoning: string;
      if (wouldResolve) {
        reasoning = `Splitting ${bill.name} into two $${splitAmount.toFixed(2)} payments would fully cover this period's $${period.shortfall.toFixed(2)} shortfall.`;
      } else {
        reasoning = `Splitting ${bill.name} would reduce this period's shortfall from $${period.shortfall.toFixed(2)} to $${newShortfall.toFixed(2)}, but wouldn't fully resolve it.`;
      }

      if (nextPeriod && wouldResolve) {
        reasoning += ` The remaining $${splitAmount.toFixed(2)} would be due on ${nextPeriod.payDate.toDateString()}.`;
      }

      suggestions.push({
        billId: bill.id,
        billName: bill.name,
        billAmount: bill.amount,
        periodStart: period.start,
        currentShortfall: period.shortfall,
        splitAmount,
        wouldResolve,
        reasoning,
      });
    }
  }

  return suggestions;
}

export interface OpportunitySuggestion {
  periodStart: Date;
  payDate: Date;
  extraAmount: number;
  reasoning: string;
}

export function generateOpportunitySuggestions(periods: PayPeriod[]): OpportunitySuggestion[] {
  const suggestions: OpportunitySuggestion[] = [];

  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];
    if (!period.isThreePaycheckMonth || period.isCashflowRisk) continue;

    // This paycheck's "extra" amount is whatever's left after this period's own bills
    const surplus = period.income - period.totalBillAmount;
    if (surplus <= 0) continue;

    // Look ahead: is there a leaner period coming up (income covers bills, but with little room)?
    const nextPeriod = periods[i + 1];
    let reasoning = `This is a 3-paycheck month — you have an extra $${period.income.toFixed(2)} paycheck this period beyond your usual bills, leaving about $${surplus.toFixed(2)} free.`;

    if (nextPeriod && !nextPeriod.isThreePaycheckMonth) {
      reasoning += ` Consider setting some aside as a buffer, or prepaying a splittable bill ahead of schedule, so the next regular pay period (starting ${nextPeriod.payDate.toDateString()}) feels lighter.`;
    } else {
      reasoning += ` Consider setting some aside as a buffer for a future tighter month.`;
    }

    suggestions.push({
      periodStart: period.start,
      payDate: period.payDate,
      extraAmount: surplus,
      reasoning,
    });
  }

  return suggestions;
}

export interface SplitPaymentPlan {
  date: Date;
  amount: number;
  isLate: boolean;
}

export interface SplitPlan {
  firstPayment: SplitPaymentPlan;
  secondPayment: SplitPaymentPlan;
}

export function nextOccurrenceOnOrAfter(dueDate: number, afterDate: Date): Date {
  const occurrence = new Date(afterDate.getFullYear(), afterDate.getMonth(), dueDate);
  if (occurrence < afterDate) {
    occurrence.setMonth(occurrence.getMonth() + 1);
  }
  return occurrence;
}

export function pickSplitDates(
  dueDate: Date,
  paySchedule: PaySchedule,
  anchorDate: Date
): [Date, Date] {
  const rangeStart = new Date(dueDate);
  rangeStart.setDate(rangeStart.getDate() - 60);

  const payDates = getPayDatesInRange(paySchedule, anchorDate, rangeStart, dueDate);
  const chosen = payDates.slice(-2);

  return [chosen[0] ?? dueDate, chosen[1] ?? chosen[0] ?? dueDate];
}

export function planBillSplit(
  bill: Bill,
  paySchedule: PaySchedule,
  anchorDate: Date,
  windowDays: number = 90
): SplitPlan {
  const dueDates = projectBillDueDates(bill.dueDate, windowDays);
  const dueDate = dueDates[0];

  const [firstDate, secondDate] = pickSplitDates(dueDate, paySchedule, anchorDate);

  const half = bill.amount / 2;
  const makePayment = (date: Date): SplitPaymentPlan => ({
    date,
    amount: half,
    isLate: date > dueDate,
  });

  return {
    firstPayment: makePayment(firstDate),
    secondPayment: makePayment(secondDate),
  };
}

export function getCurrentOccurrence(dueDate: number, referenceDate: Date = new Date()): Date {
  return new Date(referenceDate.getFullYear(), referenceDate.getMonth(), dueDate);
}

export function getPayDatesInRange(
  paySchedule: PaySchedule,
  anchorDate: Date,
  rangeStart: Date,
  rangeEnd: Date
): Date[] {
  const payDates: Date[] = [];
  let current = new Date(anchorDate);

  while (current > rangeStart) {
    current = retreatPayDate(current, paySchedule);
  }
  while (current <= rangeEnd) {
    if (current >= rangeStart) payDates.push(new Date(current));
    current = advancePayDate(current, paySchedule);
  }

  return payDates;
}

export interface UnresolvedOccurrence {
  billId: string;
  billName: string;
  amount: number;
  dueDate: Date;
}

export function findUnresolvedOccurrences(
  bills: Bill[],
  paySchedule: PaySchedule,
  anchorDate: Date,
  earliestPeriodStart: Date,
  paidOccurrences: PaidOccurrence[]
): UnresolvedOccurrence[] {
  const lookbackStart = retreatPayDate(earliestPeriodStart, paySchedule);

  const isPaidOccurrence = (billId: string, date: Date) =>
    paidOccurrences.some(
      (p) =>
        p.billId === billId &&
        p.date.getFullYear() === date.getFullYear() &&
        p.date.getMonth() === date.getMonth() &&
        p.date.getDate() === date.getDate()
    );

  const unresolved: UnresolvedOccurrence[] = [];

  for (const bill of bills) {
    const dueDate = nextOccurrenceOnOrAfter(bill.dueDate, lookbackStart);
    if (dueDate >= earliestPeriodStart) continue; // visible in a real period already, not orphaned
    if (isPaidOccurrence(bill.id, dueDate)) continue;

    let assignmentDate = dueDate;
    if (bill.fundingModel === "NEXT_CHECK") {
      const payDatesInRange = getPayDatesInRange(paySchedule, anchorDate, lookbackStart, earliestPeriodStart);
      const funding = payDatesInRange.find((pd) => pd >= dueDate);
      if (funding) assignmentDate = funding;
    }

    if (assignmentDate < earliestPeriodStart) {
      unresolved.push({ billId: bill.id, billName: bill.name, amount: bill.amount, dueDate });
    }
  }

  return unresolved;
}