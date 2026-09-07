import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/session";

export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.update({
    where: { id: userId },
    data: { currentCycleStartedAt: new Date() },
  });

  return NextResponse.json({ currentCycleStartedAt: user.currentCycleStartedAt });
}