import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/session";
import { createBillSplit, regenerateSplitsIfNeeded } from "@/lib/split-bill";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.bill.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { name, amount, dueDate, category, splittable, fundingModel } = await request.json();

  const dueDateChanged = dueDate !== undefined && Number(dueDate) !== existing.dueDate;
  const splittableChanged = splittable !== undefined && !!splittable !== existing.splittable;

  const updated = await prisma.bill.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(amount && { amount: Number(amount) }),
      ...(dueDate && { dueDate: Number(dueDate) }),
      ...(category !== undefined && { category: category || null }),
      ...(splittable !== undefined && { splittable: !!splittable }),
      ...(fundingModel === "NEXT_CHECK" || fundingModel === "BEFORE_DUE"
        ? { fundingModel }
        : {}),
    },
  });

  if (dueDateChanged || splittableChanged) {
    await regenerateSplitsIfNeeded(id, userId, updated.splittable);
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.bill.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.bill.delete({ where: { id } });
  return NextResponse.json({ success: true });
}