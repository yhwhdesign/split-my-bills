import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/session";

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

  const payment = await prisma.payment.create({
    data: {
      billId,
      amount: bill.amount,
      paidDate: new Date(),
      status: "PAID",
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

  // Find and remove the most recent unpaid-back "PAID" record for this bill this month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const recentPayment = await prisma.payment.findFirst({
    where: { billId, status: "PAID", paidDate: { gte: startOfMonth } },
    orderBy: { paidDate: "desc" },
  });

  if (recentPayment) {
    await prisma.payment.delete({ where: { id: recentPayment.id } });
  }

  return NextResponse.json({ success: true });
}