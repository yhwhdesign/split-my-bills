import { isCashflowRisk, type Bill } from "@split-my-bills/shared";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const userCount = await prisma.user.count();

  const sampleBill: Bill = {
    id: "1",
    name: "Car Insurance",
    amount: 400,
    dueDate: 5,
    splittable: true,
  };

  const availableIncome = 300;
  const risky = isCashflowRisk(sampleBill, availableIncome);

  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Split My Bills</h1>
      <p>Users in database: {userCount}</p>
      <p>
        Sample bill: {sampleBill.name} — ${sampleBill.amount}
      </p>
      <p>
        Cashflow risk with ${availableIncome} available:{" "}
        <strong>{risky ? "YES ⚠️" : "No"}</strong>
      </p>
    </main>
  );
}