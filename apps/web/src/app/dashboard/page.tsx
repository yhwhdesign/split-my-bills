"use client";

import { normalizeToMonthly, type PaySchedule } from "@split-my-bills/shared";
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
import { Pencil, Trash2, Check, X, CheckCircle2, Circle } from "lucide-react";

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
  paidThisMonth: boolean;
};

export default function DashboardPage() {
  const router = useRouter();
  const [income, setIncome] = useState<IncomeSource[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [expandedPeriod, setExpandedPeriod] = useState<number | null>(null);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [coaching, setCoaching] = useState<string | null>(null);
  const [coachingLoading, setCoachingLoading] = useState(false);
  const [limitReached, setLimitReached] = useState(false);


  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [incomeRes, billsRes, periodsRes] = await Promise.all([
      fetch("/api/income"),
      fetch("/api/bills"),
      fetch("/api/split-suggestions"),
    ]);
    setIncome(await incomeRes.json());
    setBills(await billsRes.json());
   const periodsData = await periodsRes.json();
    setPeriods(periodsData.periods ?? []);
    setSuggestions(periodsData.suggestions ?? []);
    setOpportunities(periodsData.opportunities ?? []);
    setLoading(false);
  }

  useEffect(() => {
  if (!loading) {
    loadCoaching();
  }
}, [loading]);

async function loadCoaching() {
  setCoachingLoading(true);
  const res = await fetch("/api/ai-coaching");
  const data = await res.json();
  setCoaching(data.coaching);
  setLimitReached(!!data.limitReached);
  setCoachingLoading(false);
}

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
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

  async function handleDeleteIncome(id: string) {
    await fetch(`/api/income/${id}`, { method: "DELETE" });
    loadData();
  }

  async function handleDeleteBill(id: string) {
    await fetch(`/api/bills/${id}`, { method: "DELETE" });
    loadData();
  }

  async function handleUpdateIncome(id: string, amount: string) {
    await fetch(`/api/income/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(amount) }),
    });
    setEditingIncomeId(null);
    loadData();
  }

  async function handleUpdateBill(id: string, amount: string) {
    await fetch(`/api/bills/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(amount) }),
    });
    setEditingBillId(null);
    loadData();
  }

  async function handleTogglePaid(billId: string, currentlyPaid: boolean) {
    await fetch(`/api/bills/${billId}/pay`, {
      method: currentlyPaid ? "DELETE" : "POST",
    });
    loadData();
  }

  const totalIncome = income.reduce(
    (sum, i) => sum + normalizeToMonthly(Number(i.amount), i.frequency as PaySchedule),
  0
  );
  const totalBills = bills.reduce((sum, b) => sum + Number(b.amount), 0);
  const currentPeriod = periods.length > 0 ? periods[0] : null;
  const periodRemaining = currentPeriod ? currentPeriod.income - currentPeriod.totalBillAmount : totalIncome - totalBills;
  const [suggestions, setSuggestions] = useState<any[]>([]);


  if (loading) {
    return <main className="p-8">Loading...</main>;
  }

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8 space-y-6 sm:space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Button variant="outline" onClick={handleLogout}>
          Log out
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
    <CardDescription>
      {currentPeriod
        ? `Remaining (through ${new Date(currentPeriod.end).toLocaleDateString()})`
        : "Remaining"}
    </CardDescription>
    <CardTitle
      className={`text-2xl ${periodRemaining < 0 ? "text-destructive" : "text-primary"}`}
    >
      ${periodRemaining.toFixed(2)}
    </CardTitle>
  </CardHeader>
</Card>
      </div>

      <Card className="border-primary/40 bg-primary/5">
  <CardHeader>
    <CardTitle>Your AI Coach</CardTitle>
  </CardHeader>
  <CardContent>
  {coachingLoading ? (
    <p className="text-muted-foreground text-sm">Thinking...</p>
  ) : limitReached ? (
    <p className="text-muted-foreground text-sm">
      AI suggestions have reached today's limit — your bills and split suggestions above are
      still fully accurate. Check back tomorrow for AI coaching.
    </p>
  ) : coaching ? (
    <p className="text-sm whitespace-pre-wrap">{coaching}</p>
  ) : (
    <p className="text-muted-foreground text-sm">No suggestions available right now.</p>
  )}
</CardContent>
</Card>

      {periods.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Pay Periods</CardTitle>
            <CardDescription>Based on your pay schedule and bills</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {periods.map((p, idx) => (
              <div
                key={idx}
                className={`rounded-md border text-sm ${
                  p.isCashflowRisk ? "border-destructive/50 bg-destructive/5" : "border-border"
                }`}
              >
                <button
                  onClick={() => setExpandedPeriod(expandedPeriod === idx ? null : idx)}
                  className="flex w-full items-center justify-between p-3 text-left"
                >
                  <div>
                    <div className="font-medium">
                      {new Date(p.payDate).toLocaleDateString()}
                      {p.isThreePaycheckMonth && (
                        <span className="ml-2 text-xs text-primary">3-paycheck month</span>
                      )}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {p.bills.length} bill{p.bills.length !== 1 ? "s" : ""} — $
                      {p.totalBillAmount.toFixed(2)} due
                    </div>
                  </div>
                  {p.isCashflowRisk ? (
                    <span className="text-destructive text-xs font-medium">
                      Short ${p.shortfall.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">OK</span>
                  )}
                </button>

                {expandedPeriod === idx && p.bills.length > 0 && (
                  <div className="border-t px-3 py-2 space-y-1">
                    {p.bills.map((item: any, i: number) => (
                      <div
                        key={i}
                        className="flex justify-between text-xs text-muted-foreground"
                      >
                        <span>{item.bill.name}</span>
                        <span>${item.bill.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {suggestions.length > 0 && (
  <Card className="border-primary/30 bg-primary/5">
    <CardHeader>
      <CardTitle>Split Suggestions</CardTitle>
      <CardDescription>Ways to smooth out tight pay periods</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      {suggestions.map((s, idx) => (
        <div key={idx} className="rounded-md border border-primary/20 bg-background p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">{s.billName}</span>
            <span
              className={`text-xs font-medium ${
                s.wouldResolve ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {s.wouldResolve ? "Resolves shortfall" : "Partial help"}
            </span>
          </div>
          <p className="text-muted-foreground text-xs mt-1">{s.reasoning}</p>
        </div>
      ))}
    </CardContent>
  </Card>
)}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Income Sources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {income.map((i) => (
              <div key={i.id} className="flex items-center justify-between text-sm border-b pb-2">
                <span>{i.name}</span>
                <div className="flex items-center gap-2">
                  {editingIncomeId === i.id ? (
                    <EditAmountForm
                      initialValue={i.amount}
                      onSave={(val) => handleUpdateIncome(i.id, val)}
                      onCancel={() => setEditingIncomeId(null)}
                    />
                  ) : (
                    <>
                      <span>${Number(i.amount).toFixed(2)}</span>
                      <button
                        onClick={() => setEditingIncomeId(i.id)}
                        className="text-muted-foreground/50 hover:text-primary transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteIncome(i.id)}
                        className="text-muted-foreground/50 hover:text-destructive transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
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
                <div className="flex items-center gap-2">
                  <button onClick={() => handleTogglePaid(b.id, b.paidThisMonth)}>
                    {b.paidThisMonth ? (
                      <CheckCircle2 size={16} className="text-primary" />
                    ) : (
                      <Circle size={16} className="text-muted-foreground/40" />
                    )}
                  </button>
                  <span className={b.paidThisMonth ? "text-muted-foreground line-through" : ""}>
                    {b.name} (due {b.dueDate})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {editingBillId === b.id ? (
                    <EditAmountForm
                      initialValue={b.amount}
                      onSave={(val) => handleUpdateBill(b.id, val)}
                      onCancel={() => setEditingBillId(null)}
                    />
                  ) : (
                    <>
                      <span>${Number(b.amount).toFixed(2)}</span>
                      <button
                        onClick={() => setEditingBillId(b.id)}
                        className="text-muted-foreground/50 hover:text-primary transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteBill(b.id)}
                        className="text-muted-foreground/50 hover:text-destructive transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
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

        {opportunities.length > 0 && (
  <Card className="border-primary/30 bg-primary/5">
    <CardHeader>
      <CardTitle>Extra Paycheck Opportunities</CardTitle>
      <CardDescription>Months with a 3rd paycheck — good chances to get ahead</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      {opportunities.map((o, idx) => (
        <div key={idx} className="rounded-md border border-primary/20 bg-background p-3 text-sm">
          <div className="font-medium">{new Date(o.payDate).toLocaleDateString()}</div>
          <p className="text-muted-foreground text-xs mt-1">{o.reasoning}</p>
        </div>
      ))}
    </CardContent>
  </Card>
)}
      </div>
    </main>
  );
}

function EditAmountForm({
  initialValue,
  onSave,
  onCancel,
}: {
  initialValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-7 w-24 text-sm"
        autoFocus
      />
      <button onClick={() => onSave(value)} className="text-primary hover:opacity-80">
        <Check size={16} />
      </button>
      <button onClick={onCancel} className="text-muted-foreground/50 hover:text-foreground">
        <X size={16} />
      </button>
    </div>
  );
}