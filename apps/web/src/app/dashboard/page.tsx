"use client";

import { DayOfMonthPicker } from "@/components/day-of-month-picker";
import { SplitSquareHorizontal, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { normalizeToMonthly, type PaySchedule } from "@split-my-bills/shared";
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
import {
  Pencil,
  Trash2,
  Check,
  X,
  CheckCircle2,
  Circle,
  Home,
  Zap,
  Wifi,
  Car,
  //ShoppingCart,
  HeartPulse,
  Tag,
  Droplet,
  Flame,
  Phone,
  Tv,
  CreditCard,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { InstallPrompt } from "@/components/install-prompt";
import { suggestCategory } from "@/lib/categorize-bill";

type IncomeSource = {
  id: string;
  name: string;
  amount: string;
  frequency: string;
  nextPayDate: string;
};

type SplitPaymentLeg = {
  id: string;
  amount: string;
  paidDate: string;
  status: string;
  isSplitPayment: boolean;
}

type Bill = {
  id: string;
  name: string;
  amount: string;
  dueDate: number;
  category: string | null;
  splittable: boolean;
  paidThisMonth: boolean;
  hasActiveSplit: boolean;
  hasLateSplit: boolean;
  payments: SplitPaymentLeg[];
  isOverdue: boolean;
};

export default function DashboardPage() {
  const router = useRouter();
  const [income, setIncome] = useState<IncomeSource[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [expandedPeriod, setExpandedPeriod] = useState<number | null>(null);
  const [coaching, setCoaching] = useState<string | null>(null);
  const [coachingLoading, setCoachingLoading] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!loading) {
      loadCoaching();
    }
  }, [loading]);

  async function loadData() {
    const [incomeRes, billsRes, periodsRes, userRes] = await Promise.all([
      fetch("/api/income"),
      fetch("/api/bills"),
      fetch("/api/split-suggestions"),
      fetch("/api/user/me"),
    ]);
    setIncome(await incomeRes.json());
    setBills(await billsRes.json());
    const periodsData = await periodsRes.json();
    setPeriods(periodsData.periods ?? []);
    setSuggestions(periodsData.suggestions ?? []);
    setOpportunities(periodsData.opportunities ?? []);
    const userData = await userRes.json();
    setUserName(userData.name ?? null);
    setLoading(false);
  }

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

  async function handleToggleSplitPaymentPaid(paymentId: string, currentlyPaid: boolean) {
  await fetch(`/api/payments/${paymentId}/pay`, {
    method: currentlyPaid ? "DELETE" : "POST",
  });
  loadData();
}

  async function handleSplitBill(billId: string) {
  await fetch(`/api/bills/${billId}/split`, { method: "POST" });
  loadData();
}

  const totalIncome = income.reduce(
    (sum, i) => sum + normalizeToMonthly(Number(i.amount), i.frequency as PaySchedule),
    0
  );

  const rawIncomeTotal = income.reduce((sum, i) => sum + Number(i.amount), 0);

  const totalBills = bills.reduce((sum, b) => sum + Number(b.amount), 0);
  const currentPeriod = periods.length > 0 ? periods[0] : null;
  const periodRemaining = currentPeriod
    ? currentPeriod.income - currentPeriod.totalBillAmount
    : totalIncome - totalBills;

  if (loading) {
    return <main className="p-8">Loading...</main>;
  }

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8 space-y-6 sm:space-y-8">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <Logo />
          <p className="text-sm text-muted-foreground mt-1">
            {userName ? `Welcome back, ${userName}` : "Here's where things stand today"}
          </p>
        </div>
        <Button variant="outline" onClick={handleLogout} className="shrink-0">
          Log out
        </Button>
      </div>

      <InstallPrompt />

      <div className="rounded-2xl bg-zinc-900 p-6 sm:p-8 shadow-lg">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-400">Monthly Income ( Projected)</p>
            <p className="text-3xl font-bold text-white mt-1">${totalIncome.toFixed(2)}</p>
            <p className="text-xs text-zinc-500 mt-2">
              Per Paycheck (As Entered): <span className="text-zinc-300">${rawIncomeTotal.toFixed(2)}</span>
            </p>
          </div>
          <div className="sm:border-l sm:border-zinc-700 sm:pl-4">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Total Bills</p>
            <p className="text-3xl font-bold text-white mt-1">${totalBills.toFixed(2)}</p>
          </div>
          <div className="sm:border-l sm:border-zinc-700 sm:pl-4">
            <p className="text-xs uppercase tracking-wide text-zinc-400">
              {currentPeriod
                ? `Remaining (thru ${new Date(currentPeriod.end).toLocaleDateString(undefined, { timeZone: "UTC"})})`
                : "Remaining"}
            </p>
            <p
              className={`text-3xl font-bold mt-1 ${
                periodRemaining < 0 ? "text-red-400" : "text-primary"
              }`}
            >
              ${periodRemaining.toFixed(2)}
            </p>
          </div>
        </div>

        {totalIncome > 0 && (
          <div className="mt-6 pt-6 border-t border-zinc-700">
            <div className="flex justify-between text-xs text-zinc-400 mb-2">
              <span>Bills committed</span>
              <span>{Math.min(100, Math.round((totalBills / totalIncome) * 100))}% of income</span>
            </div>
            <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  totalBills / totalIncome > 1
                    ? "bg-red-400"
                    : totalBills / totalIncome > 0.8
                    ? "bg-yellow-400"
                    : "bg-primary"
                }`}
                style={{ width: `${Math.min(100, (totalBills / totalIncome) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <Card className="border-primary/30 bg-primary/5 shadow-sm py-6">
        <CardHeader>
          <CardTitle>Your AI Coach</CardTitle>
        </CardHeader>
        <CardContent>
          {coachingLoading ? (
            <p className="text-muted-foreground text-sm">Thinking...</p>
          ) : limitReached ? (
            <p className="text-muted-foreground text-sm">
              AI suggestions have reached today&apos;s limit — your bills and split suggestions
              above are still fully accurate. Check back tomorrow for AI coaching.
            </p>
          ) : coaching ? (
            <p className="text-sm whitespace-pre-wrap">{coaching}</p>
          ) : (
            <p className="text-muted-foreground text-sm">No suggestions available right now.</p>
          )}
        </CardContent>
      </Card>

      {periods.length > 0 && (
        <Card className="shadow-sm border-border/50 py-6">
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
                  className="flex w-full items-center justify-between gap-2 p-3 text-left flex-wrap"
                >
                  <div>
                    <div className="font-medium">
                      {new Date(p.payDate).toLocaleDateString(undefined, { timeZone: "UTC"})}
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
                    <span className="rounded-full bg-destructive/10 text-destructive text-xs font-semibold px-2.5 py-1">
                      Short ${p.shortfall.toFixed(2)}
                    </span>
                  ) : (
                    <span className="rounded-full bg-primary/10 text-primary text-xs font-semibold px-2.5 py-1">
                      On track
                    </span>
                  )}
                </button>

                {expandedPeriod === idx && p.bills.length > 0 && (
                  <div className="border-t px-3 py-2 space-y-1">
                    {p.bills.map((item: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs text-muted-foreground">
                        <span className="font-medium">{item.bill.name}</span>
                        <span className="font-semibold">${item.bill.amount.toFixed(2)}</span>
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
        <Card className="border-primary/30 bg-primary/5 shadow-sm py-6">
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
                <Button
                  size="sm"
                  className="mt-2 font-semibold"
                  onClick={() => handleSplitBill(s.billId)}
                >
                  Split this bill
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {opportunities.length > 0 && (
        <Card className="border-primary/30 bg-primary/5 shadow-sm py-6">
          <CardHeader>
            <CardTitle>Extra Paycheck Opportunities</CardTitle>
            <CardDescription>Months with a 3rd paycheck — good chances to get ahead</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {opportunities.map((o, idx) => (
              <div key={idx} className="rounded-md border border-primary/20 bg-background p-3 text-sm">
                <div className="font-medium">{new Date(o.payDate).toLocaleDateString(undefined, { timeZone: "UTC"})}</div>
                <p className="text-muted-foreground text-xs mt-1">{o.reasoning}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="shadow-sm border-border/50 py-6">
          <CardHeader>
            <CardTitle>Income Sources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {income.map((i) => (
              <div key={i.id} className="flex items-start justify-between gap-2 text-sm border-b pb-2">
                <span className="font-medium min-w-0 break-words flex-1">{i.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {editingIncomeId === i.id ? (
                    <EditAmountForm
                      initialValue={i.amount}
                      onSave={(val) => handleUpdateIncome(i.id, val)}
                      onCancel={() => setEditingIncomeId(null)}
                    />
                  ) : (
                    <>
                      <span className="font-semibold min-w-[70px] text-right inline-block">
                        ${Number(i.amount).toFixed(2)}
                      </span>
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
              <Button type="submit" className="w-full font-semibold">
                Add Income
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50 py-6">
          <CardHeader>
            <CardTitle>Bills</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {bills.map((b) => {
  const splitLegs = b.payments.filter((p) => p.isSplitPayment);

  return (
    <div key={b.id} className="border-b pb-2">
      <div className="flex items-start justify-between gap-2 text-sm">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {b.hasActiveSplit ? (
            <SplitSquareHorizontal size={16} className="text-primary shrink-0" />
          ) : (
            <button onClick={() => handleTogglePaid(b.id, b.paidThisMonth)}>
              {b.paidThisMonth ? (
                <CheckCircle2 size={16} className="text-primary" />
              ) : (
                <Circle size={16} className="text-muted-foreground/40" />
              )}
            </button>
          )}
          <div className="flex flex-col min-w-0">
            <span
              className={`font-medium flex items-center gap-1.5 ${
                b.paidThisMonth ? "text-muted-foreground line-through" : ""
              }`}
            >
              {b.name}
              {b.hasActiveSplit && (
                <SplitSquareHorizontal size={13} className="text-primary" />
              )}
              {b.hasLateSplit && <AlertTriangle size={13} className="text-yellow-600" />}
              {b.hasLateSplit && <AlertTriangle size={13} className="text-yellow-600" />}
              {b.isOverdue && <AlertTriangle size={13} className="text-red-500" />}
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              {getCategoryIcon(b.category)}
              Due {b.dueDate}
              {b.category && ` · ${b.category}`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {editingBillId === b.id ? (
            <EditAmountForm
              initialValue={b.amount}
              onSave={(val) => handleUpdateBill(b.id, val)}
              onCancel={() => setEditingBillId(null)}
            />
          ) : (
            <>
              <span className="font-semibold min-w-[70px] text-right inline-block">
                ${Number(b.amount).toFixed(2)}
              </span>
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

      {b.hasActiveSplit && splitLegs.length > 0 && (
        <div className="ml-6 mt-1.5 space-y-1">
          {splitLegs.map((leg) => {
            const legPaid = leg.status === "PAID";
            return (
              <div key={leg.id} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <button onClick={() => handleToggleSplitPaymentPaid(leg.id, legPaid)}>
                    {legPaid ? (
                      <CheckCircle2 size={14} className="text-primary" />
                    ) : (
                      <Circle size={14} className="text-muted-foreground/40" />
                    )}
                  </button>
                  <span className={legPaid ? "text-muted-foreground line-through" : "text-muted-foreground"}>
                    {leg.paidDate &&
                      new Date(leg.paidDate).toLocaleDateString(undefined, { timeZone: "UTC" })}
                  </span>
                </div>
                <span className="font-medium">${Number(leg.amount).toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
})}
            <form onSubmit={handleAddBill} className="space-y-2 pt-2">
              <Input
                name="name"
                placeholder="Bill name"
                required
                onChange={(e) => {
                  const suggestion = suggestCategory(e.target.value);
                  const categoryInput = e.currentTarget.form?.elements.namedItem(
                    "category"
                  ) as HTMLInputElement;
                  if (suggestion && categoryInput && !categoryInput.dataset.userEdited) {
                    categoryInput.value = suggestion;
                  }
                }}
              />
              <Input name="amount" type="number" step="0.01" placeholder="Amount" required />
              <div>
                <Label className="text-xs text-muted-foreground">Due date</Label>
                <DayOfMonthPicker name="dueDate" />
              </div>
              <Input
                name="category"
                placeholder="Category (auto-suggested as you type)"
                onChange={(e) => {
                  e.currentTarget.dataset.userEdited = "true";
                }}
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="splittable" />
                Splittable into two payments
              </label>
              <Button type="submit" className="w-full font-semibold">
                Add Bill
              </Button>
            </form>
          </CardContent>
        </Card>
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

function getCategoryIcon(category: string | null) {
  const map: Record<string, typeof Tag> = {
    housing: Home,
    "car loan": Car,
    "car insurance": Car,
    electric: Zap,
    water: Droplet,
    gas: Flame,
    internet: Wifi,
    phone: Phone,
    subscription: Tv,
    "health/medical": HeartPulse,
    "credit card": CreditCard,
  };
  const Icon = category ? map[category.toLowerCase()] ?? Tag : Tag;
  return <Icon size={14} className="text-muted-foreground/60" />;
}