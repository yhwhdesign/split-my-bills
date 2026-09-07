"use client";

import { Home, Receipt, Wallet, Calendar } from "lucide-react";

export type TabKey = "home" | "bills" | "income" | "periods";

export function BottomNav({
  active,
  onChange,
  billsAlertCount,
}: {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  billsAlertCount: number;
}) {
  const tabs: { key: TabKey; label: string; icon: typeof Home }[] = [
    { key: "home", label: "Home", icon: Home },
    { key: "bills", label: "Bills", icon: Receipt },
    { key: "income", label: "Income", icon: Wallet },
    { key: "periods", label: "Periods", icon: Calendar },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border flex items-stretch"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {tabs.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`relative flex-1 flex flex-col items-center justify-center gap-1 py-2.5 touch-manipulation ${
            active === key ? "text-primary" : "text-muted-foreground"
          }`}
          aria-label={label}
        >
          <Icon size={24} strokeWidth={active === key ? 2.5 : 2} />
          <span className="text-[11px] font-medium">{label}</span>
          {key === "bills" && billsAlertCount > 0 && (
            <span className="absolute top-1 right-1/2 translate-x-4 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
              {billsAlertCount}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}