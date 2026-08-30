// Shared types used across web and (eventually) other apps in the monorepo

export type PaySchedule = "WEEKLY" | "BIWEEKLY" | "SEMIMONTHLY" | "MONTHLY";

export interface Bill {
  id: string;
  name: string;
  amount: number;
  dueDate: number; // day of month, 1-31
  splittable: boolean;
  fundingModel: "BEFORE_DUE" | "NEXT_CHECK";
  isRecurring: boolean;
}

export interface IncomeSourceInput {
  amount: number;
  paySchedule: PaySchedule;
  anchorDate: Date;
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
  endWindow.setUTCDate(endWindow.getUTCDate() + windowDays);

  // Normalize to the most recent occurrence on/before today first, whether
  // the stored anchor itself happens to be in the past or the future.
  // Without this, a perfectly normal future-dated "next pay date" (e.g.
  // someone's actual upcoming paycheck) would cause this function to skip
  // right past a real prior payday, since it previously only ever walked
  // FORWARD from the anchor and had no way to discover an earlier one.
  let current = new Date(anchorDate);
  while (current > today) {
    current = retreatPayDate(current, paySchedule);
  }

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
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
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
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "BIWEEKLY":
      next.setUTCDate(next.getUTCDate() + 14);
      break;
    case "MONTHLY":
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case "SEMIMONTHLY":
      // Semimonthly is trickier — typically the 1st and 15th of each month,
      // not a fixed number of days apart. We advance by ~15 days as an approximation,
      // then snap to whichever is closer: the 1st or the 15th.
      if (next.getUTCDate() < 15) {
        next.setUTCDate(15);
      } else {
        next.setUTCMonth(next.getUTCMonth() + 1);
        next.setUTCDate(1);
      }
      break;
  }

  return next;
}

function retreatPayDate(date: Date, schedule: PaySchedule): Date {
  const prev = new Date(date);
  switch (schedule) {
    case "WEEKLY":
      prev.setUTCDate(prev.getUTCDate() - 7);
      break;
    case "BIWEEKLY":
      prev.setUTCDate(prev.getUTCDate() - 14);
      break;
    case "MONTHLY":
      prev.setUTCMonth(prev.getUTCMonth() - 1);
      break;
    case "SEMIMONTHLY":
      if (prev.getUTCDate() > 1 && prev.getUTCDate() <= 15) {
        prev.setUTCMonth(prev.getUTCMonth() - 1);
        prev.setUTCDate(1);
      } else {
        prev.setUTCDate(15);
      }
      break;
  }
  return prev;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export function projectBillDueDates(dueDate: number, windowDays: number = 60): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  const endWindow = new Date(today);
  endWindow.setUTCDate(endWindow.getUTCDate() + windowDays);

  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), dueDate));
  if (cursor < today) cursor.setUTCMonth(cursor.getUTCMonth() + 1);

  while (cursor <= endWindow) {
    dates.push(new Date(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return dates;
}

/**
 * Merges every income source's own real payday sequence into one combined,
 * chronologically sorted timeline. If two sources happen to pay on the exact
 * same calendar day, that day appears once, with both amounts summed —
 * never as two separate zero-length periods.
 */
export function getCombinedPayDates(
  incomeSources: IncomeSourceInput[],
  windowDays: number = 60,
  includeMostRecentPast: boolean = true
): { date: Date; income: number }[] {
  const tagged: { date: Date; amount: number }[] = [];

  for (const source of incomeSources) {
    const dates = getUpcomingPayDates(
      source.paySchedule,
      source.anchorDate,
      windowDays,
      includeMostRecentPast
    );
    for (const date of dates) {
      tagged.push({ date, amount: source.amount });
    }
  }

  tagged.sort((a, b) => a.date.getTime() - b.date.getTime());

  const merged: { date: Date; income: number }[] = [];
  for (const item of tagged) {
    const last = merged[merged.length - 1];
    if (last && isSameCalendarDay(last.date, item.date)) {
      last.income += item.amount;
    } else {
      merged.push({ date: item.date, income: item.amount });
    }
  }

  return merged;
}

/**
 * Same idea as getCombinedPayDates, but for a specific past/future date range
 * (used by split-payment date selection) rather than "from today forward."
 * Returns plain dates — split payments divide a bill's amount in half
 * regardless of which income source's paycheck lands on a given date.
 */
export function getCombinedPayDatesInRange(
  incomeSources: IncomeSourceInput[],
  rangeStart: Date,
  rangeEnd: Date
): Date[] {
  const all: Date[] = [];
  for (const source of incomeSources) {
    all.push(...getPayDatesInRange(source.paySchedule, source.anchorDate, rangeStart, rangeEnd));
  }

  all.sort((a, b) => a.getTime() - b.getTime());

  const deduped: Date[] = [];
  for (const date of all) {
    const last = deduped[deduped.length - 1];
    if (!last || !isSameCalendarDay(last, date)) {
      deduped.push(date);
    }
  }

  return deduped;
}

export interface PayPeriod {
  start: Date;
  end: Date;
  payDate: Date;
  income: number;
  isThreePaycheckMonth: boolean;
  bonusPaycheckLabels: string[];
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
  incomeSources: IncomeSourceInput[],
  bills: Bill[],
  windowDays: number = 90,
  splitOverrides: SplitPaymentOverride[] = [],
  paidOccurrences: PaidOccurrence[] = []
): PayPeriod[] {
  const combined = getCombinedPayDates(incomeSources, windowDays, true);
  const payDates = combined.map((c) => c.date);

  // An "extra paycheck" is schedule-specific: biweekly normally produces
  // 2/month, occasionally 3 (the 3rd is labeled "3PD"); weekly normally
  // produces 4/month, occasionally 5 (the 5th is labeled "5PD"). Semimonthly
  // and monthly always produce the same count every month, so they never
  // qualify. Only the SPECIFIC occurrence(s) beyond a source's normal count
  // get tagged — e.g. in a 3-paycheck month, only the 3rd biweekly check is
  // "extra"; the first two are ordinary paychecks. Evaluated completely
  // independently per source, so a weekly bonus never affects a biweekly
  // date or vice versa. If two sources both land their own bonus on the
  // exact same calendar day, that day carries both labels.
  const extraPaycheckThreshold = (schedule: PaySchedule): number | null => {
    switch (schedule) {
      case "BIWEEKLY":
        return 3;
      case "WEEKLY":
        return 5;
      case "SEMIMONTHLY":
      case "MONTHLY":
        return null;
    }
  };

  const dayKey = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

  const bonusLabelsByDate = new Map<string, Set<string>>();

  for (const source of incomeSources) {
    const threshold = extraPaycheckThreshold(source.paySchedule);
    if (threshold === null) continue;

    // Widen the window here specifically — a month sitting near the edge of
    // the normal period-generation window could have its bonus payday fall
    // just past the cutoff, undercounting it. Padding by 45 extra days
    // guarantees any month we might report on is fully captured.
    const sourceDates = getUpcomingPayDates(
      source.paySchedule,
      source.anchorDate,
      windowDays + 45,
      true
    );

    const label = `${threshold}PD`;
    for (const group of groupPayDatesByMonth(sourceDates)) {
      if (group.payDates.length < threshold) continue;
      const normalCount = threshold - 1;
      const bonusDates = group.payDates.slice(normalCount);
      for (const d of bonusDates) {
        const key = dayKey(d);
        const existing = bonusLabelsByDate.get(key) ?? new Set<string>();
        existing.add(label);
        bonusLabelsByDate.set(key, existing);
      }
    }
  }

  const overriddenBillIds = new Set(splitOverrides.map((o) => o.billId));

  const isPaidOccurrence = (billId: string, date: Date) =>
    paidOccurrences.some(
      (p) =>
        p.billId === billId &&
        p.date.getUTCFullYear() === date.getUTCFullYear() &&
        p.date.getUTCMonth() === date.getUTCMonth() &&
        p.date.getUTCDate() === date.getUTCDate()
    );

  const billDueDates = bills
    .filter((bill) => !overriddenBillIds.has(bill.id))
    .map((bill) => {
      // A non-recurring bill (a one-time "quick spend") should only ever
      // have ONE relevant occurrence — the current cycle's — not repeat
      // forever the way a normal recurring bill's due date does.
      const projected = bill.isRecurring
        ? projectBillDueDates(bill.dueDate, windowDays)
        : [getCurrentOccurrence(bill.dueDate)];

      // Always also consider the CURRENT cycle's occurrence as a placement
      // candidate, even if it's already overdue relative to today —
      // projectBillDueDates() is forward-only and would otherwise skip
      // straight to next month, leaving a genuinely still-outstanding
      // overdue bill invisible to every period entirely.
      const current = getCurrentOccurrence(bill.dueDate);
      const alreadyIncluded = projected.some(
        (d) =>
          d.getUTCFullYear() === current.getUTCFullYear() &&
          d.getUTCMonth() === current.getUTCMonth() &&
          d.getUTCDate() === current.getUTCDate()
      );

      return {
        bill,
        dates: alreadyIncluded ? projected : [current, ...projected],
      };
    });

  const periods: PayPeriod[] = [];

  for (let i = 0; i < payDates.length; i++) {
    const start = payDates[i];
    const end =
      i + 1 < payDates.length
        ? payDates[i + 1]
        : new Date(start.getTime() + 1000 * 60 * 60 * 24 * 30);

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
              dueDate: payment.date.getUTCDate(),
              splittable: false,
              fundingModel: "BEFORE_DUE",
              isRecurring: true,
            },
            dueDate: payment.date,
          });
        }
      }
    }

    const totalBillAmount = billsInPeriod.reduce((sum, b) => sum + b.bill.amount, 0);
    const periodIncome = combined[i].income;
    const shortfall = totalBillAmount - periodIncome;
    const bonusPaycheckLabels = Array.from(bonusLabelsByDate.get(dayKey(start)) ?? []);

    periods.push({
      start,
      end,
      payDate: start,
      income: periodIncome,
      isThreePaycheckMonth: bonusPaycheckLabels.length > 0,
      bonusPaycheckLabels,
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
  bonusPaycheckLabels: string[];
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
    let reasoning = `This is an extra paycheck this month — you have $${period.income.toFixed(2)} beyond your usual bills this period, leaving about $${surplus.toFixed(2)} free.`;

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
      bonusPaycheckLabels: period.bonusPaycheckLabels,
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
  const occurrence = new Date(Date.UTC(afterDate.getUTCFullYear(), afterDate.getUTCMonth(), dueDate));
  if (occurrence < afterDate) {
    occurrence.setUTCMonth(occurrence.getUTCMonth() + 1);
  }
  return occurrence;
}

/**
 * Picks the two dates that fund a split bill, drawing from the FULL combined
 * pool of every income source's real paydays — not just one person's
 * schedule. Anchored to the bill's due date, not today's date, so it works
 * correctly regardless of when someone happens to open the app.
 */
export function pickSplitDates(
  dueDate: Date,
  incomeSources: IncomeSourceInput[]
): [Date, Date] {
  const rangeStart = new Date(dueDate);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 60);

  const payDates = getCombinedPayDatesInRange(incomeSources, rangeStart, dueDate);
  const chosen = payDates.slice(-2);

  return [chosen[0] ?? dueDate, chosen[1] ?? chosen[0] ?? dueDate];
}

export function planBillSplit(
  bill: Bill,
  incomeSources: IncomeSourceInput[]
): SplitPlan {
  // Deliberately NOT projectBillDueDates() here — that function always skips
  // forward past a due date already in the past relative to today, which is
  // correct for "what's coming up next" but wrong for "which occurrence
  // should this split fund." A bill added after its due date has already
  // passed this cycle still needs THIS cycle's occurrence funded — not
  // silently pushed to next month. getCurrentOccurrence() always returns
  // the current month's occurrence regardless of past/future, matching the
  // same semantics already used for paid-status tracking elsewhere.
  const dueDate = getCurrentOccurrence(bill.dueDate);

  const [firstDate, secondDate] = pickSplitDates(dueDate, incomeSources);

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
  return new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), dueDate));
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
  incomeSources: IncomeSourceInput[],
  earliestPeriodStart: Date,
  paidOccurrences: PaidOccurrence[]
): UnresolvedOccurrence[] {
  const isPaidOccurrence = (billId: string, date: Date) =>
    paidOccurrences.some(
      (p) =>
        p.billId === billId &&
        p.date.getUTCFullYear() === date.getUTCFullYear() &&
        p.date.getUTCMonth() === date.getUTCMonth() &&
        p.date.getUTCDate() === date.getUTCDate()
    );

  const unresolved: UnresolvedOccurrence[] = [];

  for (const bill of bills) {
    // Split bills are deliberately excluded here — this function has no
    // concept of "half a leg," so it would always report a split bill's
    // FULL budgeted amount, which is wrong once even one leg is involved.
    // Split bills already have their own correct, working mechanism (the
    // per-leg checkboxes, with proper half-amounts), so routing them
    // through this generic check would double-count and misreport them.
    if (bill.splittable) continue;

    // The CURRENT cycle's occurrence — whether it's already passed or is
    // still upcoming — is what matters here, regardless of how many pay
    // cycles back that puts it. A bill's obligation doesn't disappear just
    // because more than one payday has gone by since its due date. This
    // deliberately has no arbitrary "how far back" cap.
    const dueDate = getCurrentOccurrence(bill.dueDate);
    if (isPaidOccurrence(bill.id, dueDate)) continue;

    let assignmentDate = dueDate;
    if (bill.fundingModel === "NEXT_CHECK") {
      const searchEnd = new Date(dueDate);
      searchEnd.setUTCDate(searchEnd.getUTCDate() + 45);
      const combinedInRange = getCombinedPayDatesInRange(incomeSources, dueDate, searchEnd);
      const funding = combinedInRange.find((pd) => pd >= dueDate);
      if (funding) assignmentDate = funding;
    }

    if (assignmentDate < earliestPeriodStart) {
      unresolved.push({ billId: bill.id, billName: bill.name, amount: bill.amount, dueDate });
    }
  }

  return unresolved;
}