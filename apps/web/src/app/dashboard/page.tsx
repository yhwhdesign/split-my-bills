"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type IncomeSource = {
  id: string;
  name: string;
  amount: string;
  frequency: string;
  nextPayDate: string;
};

type Bill = {
  id: string;
  name: string;
  amount: string;
  dueDate: number;
  category: string | null;
  splittable: boolean;
};

export default function DashboardPage() {
  const router = useRouter();
  const [income, setIncome] = useState<IncomeSource[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [incomeRes, billsRes] = await Promise.all([
      fetch("/api/income"),
      fetch("/api/bills"),
    ]);
    setIncome(await incomeRes.json());
    setBills(await billsRes.json());
    setLoading(false);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function handleDeleteIncome(id: string) {
  await fetch(`/api/income/${id}`, { method: "DELETE" });
  loadData();
}

async function handleDeleteBill(id: string) {
  await fetch(`/api/bills/${id}`, { method: "DELETE" });
  loadData();
}

  async function handleAddIncome(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    await fetch("/api/income", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        amount: Number(formData.get("amount")),
        frequency: formData.get("frequency"),
        nextPayDate: formData.get("nextPayDate"),
      }),
    });
    form.reset();
    loadData();
  }

  async function handleAddBill(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    await fetch("/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        amount: Number(formData.get("amount")),
        dueDate: formData.get("dueDate"),
        category: formData.get("category"),
        splittable: formData.get("splittable") === "on",
      }),
    });
    form.reset();
    loadData();
  }

  const totalIncome = income.reduce((sum, i) => sum + Number(i.amount), 0);
  const totalBills = bills.reduce((sum, b) => sum + Number(b.amount), 0);
  const remaining = totalIncome - totalBills;

  if (loading) {
    return <main className="p-8">Loading...</main>;
  }

  return (
    <main className="mx-auto max-w-4xl p-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Button variant="outline" onClick={handleLogout}>
          Log out
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Income</CardDescription>
            <CardTitle className="text-2xl">${totalIncome.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Bills</CardDescription>
            <CardTitle className="text-2xl">${totalBills.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Remaining</CardDescription>
            <CardTitle className={`text-2xl ${remaining < 0 ? "text-destructive" : "text-primary"}`}>
              ${remaining.toFixed(2)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Income Sources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {income.map((i) => (
              <div key={i.id} className="flex items-center justify-between text-sm border-b pb-2">
                <span>{i.name}</span>
                <div className="flex items-center gap-2">
                  <span>${Number(i.amount).toFixed(2)}</span>
                  <button
                    onClick={() => handleDeleteIncome(i.id)}
                    className="text-destructive text-xs hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            <form onSubmit={handleAddIncome} className="space-y-2 pt-2">
              <Input name="name" placeholder="Source name" required />
              <Input name="amount" type="number" step="0.01" placeholder="Amount" required />
              <select
                name="frequency"
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Biweekly</option>
                <option value="SEMIMONTHLY">Semimonthly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
              <Label htmlFor="nextPayDate" className="text-xs text-muted-foreground">
                Next pay date
              </Label>
              <Input name="nextPayDate" type="date" required />
              <Button type="submit" className="w-full">
                Add Income
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bills</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {bills.map((b) => (
              <div key={b.id} className="flex items-center justify-between text-sm border-b pb-2">
                <span>{b.name} (due {b.dueDate})</span>
                <div className="flex items-center gap-2">
                  <span>${Number(b.amount).toFixed(2)}</span>
                  <button
                    onClick={() => handleDeleteBill(b.id)}
                    className="text-destructive text-xs hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            <form onSubmit={handleAddBill} className="space-y-2 pt-2">
              <Input name="name" placeholder="Bill name" required />
              <Input name="amount" type="number" step="0.01" placeholder="Amount" required />
              <Input
                name="dueDate"
                type="number"
                min="1"
                max="31"
                placeholder="Day of month due"
                required
              />
              <Input name="category" placeholder="Category (optional)" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="splittable" />
                Splittable into two payments
              </label>
              <Button type="submit" className="w-full">
                Add Bill
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}