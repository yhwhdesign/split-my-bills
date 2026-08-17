import { calculatePayPeriods, generateSplitSuggestions, type Bill, type PaySchedule } from "@split-my-bills/shared";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/session";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const incomeSources = await prisma.incomeSource.findMany({ where: { userId } });
  const bills = await prisma.bill.findMany({ where: { userId } });

  if (!user || incomeSources.length === 0) {
    return NextResponse.json({ periods: [] });
  }

  // For now, sum all income sources into one combined amount per the user's primary pay schedule.
  // (Multiple income sources with different schedules is a real future refinement — noted, not solved here.)
  const totalIncome = incomeSources.reduce((sum, i) => sum + Number(i.amount), 0);

  const sharedBills: Bill[] = bills.map((b) => ({
    id: b.id,
    name: b.name,
    amount: Number(b.amount),
    dueDate: b.dueDate,
    splittable: b.splittable,
  }));

  const periods = calculatePayPeriods(
  totalIncome,
  user.paySchedule as PaySchedule,
  user.paydayAnchor,
  sharedBills
);

const suggestions = generateSplitSuggestions(periods);

return NextResponse.json({ periods, suggestions });

  return NextResponse.json({ periods });
}