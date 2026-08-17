// Shared types used across web and (eventually) other apps in the monorepo

export type PaySchedule = "WEEKLY" | "BIWEEKLY" | "SEMIMONTHLY" | "MONTHLY";

export interface Bill {
  id: string;
  name: string;
  amount: number;
  dueDate: number; // day of month, 1-31
  splittable: boolean;
}

export function isCashflowRisk(bill: Bill, availableIncome: number): boolean {
  return bill.amount > availableIncome;
}

export function getUpcomingPayDates(
  paySchedule: PaySchedule,
  anchorDate: Date,
  windowDays: number = 60
): Date[] {
  const payDates: Date[] = [];
  const today = new Date();
  const endWindow = new Date(today);
  endWindow.setDate(endWindow.getDate() + windowDays);

  let current = new Date(anchorDate);

  // Fast-forward the anchor date up to "today" based on the schedule's interval
  while (current < today) {
    current = advancePayDate(current, paySchedule);
  }

  // Collect every pay date that falls within our window
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

export function calculatePayPeriods(
  incomeAmount: number,
  paySchedule: PaySchedule,
  anchorDate: Date,
  bills: Bill[],
  windowDays: number = 60
): PayPeriod[] {
  const payDates = getUpcomingPayDates(paySchedule, anchorDate, windowDays);
  const monthGroups = groupPayDatesByMonth(payDates);

  // Map each pay date to whether its month has 3 paychecks
  const threePaycheckMonthKeys = new Set(
    monthGroups.filter((g) => g.isThreePaycheckMonth).map((g) => g.month)
  );

  // Pre-compute real due dates for every bill in the window
  const billDueDates = bills.map((bill) => ({
    bill,
    dates: projectBillDueDates(bill.dueDate, windowDays),
  }));

  const periods: PayPeriod[] = [];

  for (let i = 0; i < payDates.length; i++) {
    const start = payDates[i];
    const end = i + 1 < payDates.length ? payDates[i + 1] : new Date(start.getTime() + 1000 * 60 * 60 * 24 * 30);

    const monthKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;

    const billsInPeriod: { bill: Bill; dueDate: Date }[] = [];
    for (const { bill, dates } of billDueDates) {
      for (const d of dates) {
        if (d >= start && d < end) {
          billsInPeriod.push({ bill, dueDate: d });
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