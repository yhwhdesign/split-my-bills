import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/session";
import { getCurrentOccurrence } from "@split-my-bills/shared";

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function endOfDay(date: Date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() + 1);
  return d;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: billId } = await params;
  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill || bill.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  //const [occurrenceDueDate] = projectBillDueDates(bill.dueDate);
  const occurrenceDueDate = getCurrentOccurrence(bill.dueDate);

  const payment = await prisma.payment.create({
    data: {
      billId,
      amount: bill.amount,
      paidDate: occurrenceDueDate,
      status: "PAID",
      isSplitPayment: false,
    },
  });

  return NextResponse.json(payment, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: billId } = await params;
  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill || bill.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  //const [occurrenceDueDate] = projectBillDueDates(bill.dueDate);
  const occurrenceDueDate = getCurrentOccurrence(bill.dueDate);

  const recentPayment = await prisma.payment.findFirst({
    where: {
      billId,
      status: "PAID",
      isSplitPayment: false,
      paidDate: {
        gte: startOfDay(occurrenceDueDate),
        lt: endOfDay(occurrenceDueDate),
      },
    },
    orderBy: { paidDate: "desc" },
  });

  if (recentPayment) {
    await prisma.payment.delete({ where: { id: recentPayment.id } });
  }

  return NextResponse.json({ success: true });
}