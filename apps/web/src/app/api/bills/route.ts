import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth";
import { cookies } from "next/headers";
import { getCurrentUserId } from "@/lib/session";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bills = await prisma.bill.findMany({
    where: { userId },
    orderBy: { dueDate: "asc" },
  });

  return NextResponse.json(bills);
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

  return NextResponse.json(bill, { status: 201 });
}