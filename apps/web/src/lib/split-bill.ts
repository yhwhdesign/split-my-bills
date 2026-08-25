import { prisma } from "@/lib/prisma";
import { planBillSplit, type Bill, type PaySchedule } from "@split-my-bills/shared";

export async function createBillSplit(billId: string, userId: string) {
  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill || bill.userId !== userId) {
    throw new Error("Bill not found");
  }
  if (!bill.splittable) {
    throw new Error("Bill is not splittable");
  }

  const incomeSources = await prisma.incomeSource.findMany({ where: { userId } });
  if (incomeSources.length === 0) {
    throw new Error("No income source found");
  }
  const primaryIncome = incomeSources[0];

  const sharedBill: Bill = {
    id: bill.id,
    name: bill.name,
    amount: Number(bill.amount),
    dueDate: bill.dueDate,
    splittable: bill.splittable,
  };

  const plan = planBillSplit(
    sharedBill,
    primaryIncome.frequency as PaySchedule,
    primaryIncome.nextPayDate
  );

  const splitGroupId = crypto.randomUUID();

  const [firstPayment, secondPayment] = await prisma.$transaction([
    prisma.payment.create({
      data: {
        billId,
        amount: plan.firstPayment.amount,
        status: "SCHEDULED",
        isSplitPayment: true,
        splitGroupId,
        paidDate: plan.firstPayment.date,
        isLate: plan.firstPayment.isLate,
      },
    }),
    prisma.payment.create({
      data: {
        billId,
        amount: plan.secondPayment.amount,
        status: "SCHEDULED",
        isSplitPayment: true,
        splitGroupId,
        paidDate: plan.secondPayment.date,
        isLate: plan.secondPayment.isLate,
      },
    }),
  ]);

  return { firstPayment, secondPayment, splitGroupId };
}