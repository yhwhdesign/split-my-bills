import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/session";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: paymentId } = await params;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { bill: true },
  });

  if (!payment || payment.bill.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!payment.isSplitPayment) {
    return NextResponse.json(
      { error: "This endpoint is for split-payment legs only" },
      { status: 400 }
    );
  }

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "PAID" },
  });

  return NextResponse.json(updated, { status: 200 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: paymentId } = await params;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { bill: true },
  });

  if (!payment || payment.bill.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!payment.isSplitPayment) {
    return NextResponse.json(
      { error: "This endpoint is for split-payment legs only" },
      { status: 400 }
    );
  }

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "SCHEDULED" },
  });

  return NextResponse.json(updated, { status: 200 });
}