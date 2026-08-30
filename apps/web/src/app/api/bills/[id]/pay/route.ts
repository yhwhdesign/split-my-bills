import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/session";
import { getCurrentOccurrence } from "@split-my-bills/shared";

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

  // Optional actual-amount override — lets a user record what they really
  // paid when it differs from the budgeted bill.amount. Falls back to the
  // budgeted amount if no override is sent, or if it's not a valid
  // positive number (defend against a malformed/empty body).
  let actualAmount = Number(bill.amount);
  try {
    const body = await request.json();
    if (body && typeof body.amount === "number" && body.amount > 0) {
      actualAmount = body.amount;
    }
  } catch {
    // No body sent at all — fine, just use the budgeted amount.
  }

  const occurrenceDueDate = getCurrentOccurrence(bill.dueDate);

  // If this occurrence is already marked paid, remove that row first — this
  // request either confirms the same payment again or updates the amount.
  // Matched by calendar day (not an exact timestamp range) because local
  // dev and production can construct "midnight" a few hours apart
  // depending on server timezone — an exact-range match can miss an
  // existing row created in the other environment.
  const existingPaid = await prisma.payment.findMany({
    where: { billId, status: "PAID", isSplitPayment: false },
  });
  const staleIds = existingPaid
    .filter(
      (p) =>
        p.paidDate &&
        p.paidDate.getUTCFullYear() === occurrenceDueDate.getFullYear() &&
        p.paidDate.getUTCMonth() === occurrenceDueDate.getMonth() &&
        p.paidDate.getUTCDate() === occurrenceDueDate.getDate()
    )
    .map((p) => p.id);
  if (staleIds.length > 0) {
    await prisma.payment.deleteMany({ where: { id: { in: staleIds } } });
  }

  const payment = await prisma.payment.create({
    data: {
      billId,
      amount: actualAmount,
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

  const occurrenceDueDate = getCurrentOccurrence(bill.dueDate);

  // Matched by calendar day (not an exact timestamp range) for the same
  // reason as POST's dedup — local dev and production can construct
  // "midnight" a few hours apart depending on server timezone. Deletes
  // every matching row, not just the most recent, so a bill left with a
  // stray duplicate from that mismatch gets fully cleared in one click.
  const existingPaid = await prisma.payment.findMany({
    where: { billId, status: "PAID", isSplitPayment: false },
  });
  const staleIds = existingPaid
    .filter(
      (p) =>
        p.paidDate &&
        p.paidDate.getUTCFullYear() === occurrenceDueDate.getFullYear() &&
        p.paidDate.getUTCMonth() === occurrenceDueDate.getMonth() &&
        p.paidDate.getUTCDate() === occurrenceDueDate.getDate()
    )
    .map((p) => p.id);

  if (staleIds.length > 0) {
    await prisma.payment.deleteMany({ where: { id: { in: staleIds } } });
  }

  return NextResponse.json({ success: true });
}