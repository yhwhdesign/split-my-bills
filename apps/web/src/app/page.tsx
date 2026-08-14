import { isCashflowRisk, type Bill } from "@split-my-bills/shared";

export default function Home() {
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
      <p>
        Sample bill: {sampleBill.name} — ${sampleBill.amount}
      </p>
      <p>
        Cashflow risk with ${availableIncome} available:{" "}
        <strong>{risky ? "YES ⚠️" : "No"}</strong>
      </p>
      <p style={{ fontSize: "0.8rem", color: "gray" }}>
        (This proves apps/web can import from packages/shared ✅)
      </p>
    </main>
  );
}