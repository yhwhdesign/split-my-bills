import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
//import { verifySessionToken } from "@/lib/auth";
//import { cookies } from "next/headers";
import { getCurrentUserId } from "@/lib/session";
import { createBillSplit } from "@/lib/split-bill";
import { getCurrentOccurrence } from "@split-my-bills/shared";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bills = await prisma.bill.findMany({
    where: { userId },
    orderBy: { dueDate: "asc" },
    include: {
      payments: true,
    },
  });

  const billsWithStatus = bills.map((b) => {
    //const [occurrenceDueDate] = projectBillDueDates(b.dueDate);
    const occurrenceDueDate = getCurrentOccurrence(b.dueDate);
    const occStart = new Date(
      occurrenceDueDate.getFullYear(),
      occurrenceDueDate.getMonth(),
      occurrenceDueDate.getDate()
    );
    const occEnd = new Date(occStart);
    occEnd.setDate(occEnd.getDate() + 1);

    const paidThisMonth = b.payments.some(
      (p) =>
        p.status === "PAID" &&
        !p.isSplitPayment &&
        p.paidDate &&
        p.paidDate >= occStart &&
        p.paidDate < occEnd
    );
    const splitPayments = b.payments.filter(
      (p) => p.isSplitPayment && p.status === "SCHEDULED"
    );
    return {
      ...b,
      paidThisMonth,
      hasActiveSplit: splitPayments.length > 0,
      hasLateSplit: splitPayments.some((p) => p.isLate),
    };
  });

  return NextResponse.json(billsWithStatus);
}

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, amount, dueDate, category, splittable } = await request.json();

  if (!name || !amount || !dueDate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const bill = await prisma.bill.create({
    data: {
      userId,
      name,
      amount,
      dueDate: Number(dueDate),
      category: category || null,
      splittable: !!splittable,
    },
  });

  let splitWarning: string | null = null;

  if (bill.splittable) {
    try {
      await createBillSplit(bill.id, userId);
    } catch (err: any) {
      console.error("Auto-split on bill creation failed:", err);
      splitWarning =
        err.message === "No income source found"
          ? "Bill added, but couldn't auto-split yet — add an income source first, then split it manually."
          : "Bill added, but auto-split failed. You can try splitting it manually.";
    }
  }

  return NextResponse.json({ bill, splitWarning }, { status: 201 });
}