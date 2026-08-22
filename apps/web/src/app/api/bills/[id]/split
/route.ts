import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: billId } = await params;
  const { firstDate, secondDate } = await request.json();

  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill || bill.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!bill.splittable) {
    return NextResponse.json({ error: "This bill is not marked splittable" }, { status: 400 });
  }

  const halfAmount = Number(bill.amount) / 2;
  const splitGroupId = crypto.randomUUID();

  const [firstPayment, secondPayment] = await prisma.$transaction([
    prisma.payment.create({
      data: {
        billId,
        amount: halfAmount,
        status: "SCHEDULED",
        isSplitPayment: true,
        splitGroupId,
        paidDate: firstDate ? new Date(firstDate) : null,
      },
    }),
    prisma.payment.create({
      data: {
        billId,
        amount: halfAmount,
        status: "SCHEDULED",
        isSplitPayment: true,
        splitGroupId,
        paidDate: secondDate ? new Date(secondDate) : null,
      },
    }),
  ]);

  return NextResponse.json({ firstPayment, secondPayment, splitGroupId });
}