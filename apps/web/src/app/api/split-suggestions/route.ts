import { calculatePayPeriods, generateSplitSuggestions, generateOpportunitySuggestions, getCurrentOccurrence, type Bill, type PaySchedule, type SplitPaymentOverride, type PaidOccurrence } from "@split-my-bills/shared";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/session";


export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const incomeSources = await prisma.incomeSource.findMany({ where: { userId } });
  const bills = await prisma.bill.findMany({ where: { userId } });

  const splitPayments = await prisma.payment.findMany({
  where: {
    bill: { userId },
    isSplitPayment: true,
    status: "SCHEDULED",
  },
  include: { bill: true },
});

const overridesByBill = new Map<string, SplitPaymentOverride>();
for (const payment of splitPayments) {
  if (!payment.paidDate) continue;
  const existing = overridesByBill.get(payment.billId);
  const entry = { date: payment.paidDate, amount: Number(payment.amount) };
  if (existing) {
    existing.payments.push(entry);
  } else {
    overridesByBill.set(payment.billId, {
      billId: payment.billId,
      billName: payment.bill.name,
      payments: [entry],
    });
  }
}
const splitOverrides = Array.from(overridesByBill.values());

  if (!user || incomeSources.length === 0) {
    return NextResponse.json({ periods: [] });
  }

  // For now, sum all income sources into one combined amount per the user's primary pay schedule.
  // (Multiple income sources with different schedules is a real future refinement — noted, not solved here.)
  const totalIncome = incomeSources.reduce((sum, i) => sum + Number(i.amount), 0);

  const paidPayments = await prisma.payment.findMany({
  where: {
    bill: { userId },
    status: "PAID",
    isSplitPayment: false,
  },
});

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const paidOccurrences: PaidOccurrence[] = bills.flatMap((b) => {
  //const [occurrenceDueDate] = projectBillDueDates(b.dueDate);
  const occurrenceDueDate = getCurrentOccurrence(b.dueDate);
  const isPaid = paidPayments.some(
    (p) => p.billId === b.id && p.paidDate && isSameDay(p.paidDate, occurrenceDueDate)
  );
  return isPaid ? [{ billId: b.id, date: occurrenceDueDate }] : [];
});

  const sharedBills: Bill[] = bills.map((b) => ({
    id: b.id,
    name: b.name,
    amount: Number(b.amount),
    dueDate: b.dueDate,
    splittable: b.splittable,
  }));

  const primaryIncome = incomeSources[0];
  const periods = calculatePayPeriods(
  totalIncome,
  primaryIncome.frequency as PaySchedule,
  primaryIncome.nextPayDate,
  sharedBills,
  60,
  splitOverrides,
  paidOccurrences
);

const suggestions = generateSplitSuggestions(periods);
const opportunities = generateOpportunitySuggestions(periods);

return NextResponse.json({ periods, suggestions, opportunities });
}