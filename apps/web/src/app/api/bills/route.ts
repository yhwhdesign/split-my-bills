import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/session";
import { createBillSplit } from "@/lib/split-bill";
import { getCurrentOccurrence, nextOccurrenceOnOrAfter } from "@split-my-bills/shared";

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
    const hasActiveSplit = splitPayments.length > 0;

    const currentOccurrence = getCurrentOccurrence(b.dueDate);

    let isOverdue: boolean;

    if (b.splittable) {
      // Split legs are always dated BEFORE the due date they fund (that's
      // the whole point — paying ahead from the two most recent checks),
      // so comparing a leg's own date against the due date can never
      // resolve "overdue." Instead: figure out which due-date occurrence
      // each splitGroupId actually funds (same logic ensureRecurringSplits
      // uses to extend forward), and check whether the group funding THIS
      // cycle's occurrence is fully paid.
      const groups = new Map<string, typeof b.payments>();
      for (const p of b.payments) {
        if (!p.isSplitPayment || !p.splitGroupId) continue;
        const arr = groups.get(p.splitGroupId) ?? [];
        arr.push(p);
        groups.set(p.splitGroupId, arr);
      }

      let currentCycleFunded = false;
      for (const legs of groups.values()) {
        const dated = legs.filter((l) => l.paidDate);
        if (dated.length === 0) continue;
        const maxLegDate = new Date(Math.max(...dated.map((l) => l.paidDate!.getTime())));
        const fundedDueDate = nextOccurrenceOnOrAfter(b.dueDate, maxLegDate);
        const sameCycle =
          fundedDueDate.getFullYear() === currentOccurrence.getFullYear() &&
          fundedDueDate.getMonth() === currentOccurrence.getMonth() &&
          fundedDueDate.getDate() === currentOccurrence.getDate();
        if (sameCycle && legs.every((l) => l.status === "PAID")) {
          currentCycleFunded = true;
          break;
        }
      }

      isOverdue = currentOccurrence < new Date() && !currentCycleFunded;
    } else {
      isOverdue = !paidThisMonth && currentOccurrence < new Date();
    }

    return {
      ...b,
      paidThisMonth,
      isOverdue,
      hasActiveSplit,
      hasLateSplit: splitPayments.some((p) => p.isLate),
    };
  });

  return NextResponse.json(billsWithStatus);
}

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, amount, dueDate, category, splittable, fundingModel } = await request.json();

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
      fundingModel: fundingModel === "NEXT_CHECK" ? "NEXT_CHECK" : "BEFORE_DUE",
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