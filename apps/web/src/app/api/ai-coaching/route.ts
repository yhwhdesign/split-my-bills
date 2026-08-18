import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/session";
import {
  calculatePayPeriods,
  generateSplitSuggestions,
  generateOpportunitySuggestions,
  type Bill,
  type PaySchedule,
} from "@split-my-bills/shared";
import { OllamaProvider } from "@/lib/ai/ollama-provider";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const incomeSources = await prisma.incomeSource.findMany({ where: { userId } });
  const bills = await prisma.bill.findMany({ where: { userId } });

  if (!user || incomeSources.length === 0) {
    return NextResponse.json({ coaching: null });
  }

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
  const splitSuggestions = generateSplitSuggestions(periods);
  const opportunitySuggestions = generateOpportunitySuggestions(periods);

  const provider = new OllamaProvider();

  try {
    const coaching = await provider.generateCoaching({
      periods: periods.map((p) => ({
        payDate: p.payDate.toISOString(),
        isCashflowRisk: p.isCashflowRisk,
        shortfall: p.shortfall,
        isThreePaycheckMonth: p.isThreePaycheckMonth,
        totalBillAmount: p.totalBillAmount,
        income: p.income,
        bills: p.bills.map((b) => ({
          name: b.bill.name,
          amount: b.bill.amount,
          splittable: b.bill.splittable,
        })),
      })),
      splitSuggestions: splitSuggestions.map((s) => ({
        billName: s.billName,
        reasoning: s.reasoning,
        wouldResolve: s.wouldResolve,
      })),
      opportunitySuggestions: opportunitySuggestions.map((o) => ({
        payDate: o.payDate.toISOString(),
        reasoning: o.reasoning,
      })),
    });

    return NextResponse.json({ coaching });
  } catch (error) {
    console.error("AI coaching generation failed:", error);
    return NextResponse.json({ coaching: null, error: "AI unavailable" });
  }
}