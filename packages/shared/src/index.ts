// Shared types used across web and (eventually) other apps in the monorepo

export type PaySchedule = "weekly" | "biweekly" | "semimonthly" | "monthly";

export interface Bill {
  id: string;
  name: string;
  amount: number;
  dueDate: number; // day of month, 1-31
  splittable: boolean;
}

export function isCashflowRisk(bill: Bill, availableIncome: number): boolean {
  return bill.amount > availableIncome;
}