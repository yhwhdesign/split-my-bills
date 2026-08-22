export interface BillCategory {
  key: string;
  label: string;
  keywords: string[];
}

export const BILL_CATEGORIES: BillCategory[] = [
  { key: "housing", label: "Housing", keywords: ["rent", "mortgage", "hoa", "apartment"] },
  { key: "car_loan", label: "Car Loan", keywords: ["car loan", "auto loan", "vehicle loan"] },
  { key: "car_insurance", label: "Car Insurance", keywords: ["car insurance", "auto insurance", "geico", "progressive", "state farm"] },
  { key: "electric", label: "Electric", keywords: ["electric", "power", "pg&e", "duke energy"] },
  { key: "water", label: "Water", keywords: ["water", "sewer"] },
  { key: "gas_utility", label: "Gas", keywords: ["gas company", "natural gas"] },
  { key: "internet", label: "Internet", keywords: ["internet", "wifi", "comcast", "xfinity", "spectrum"] },
  { key: "phone", label: "Phone", keywords: ["phone", "verizon", "at&t", "t-mobile"] },
  { key: "subscription", label: "Subscription", keywords: ["netflix", "spotify", "hulu", "disney+", "subscription"] },
  { key: "health", label: "Health/Medical", keywords: ["insurance", "medical", "health", "dental"] },
  { key: "credit_card", label: "Credit Card", keywords: ["credit card", "visa", "mastercard", "amex"] },
];

export function suggestCategory(billName: string): string | null {
  const lower = billName.toLowerCase();
  for (const cat of BILL_CATEGORIES) {
    if (cat.keywords.some((kw) => lower.includes(kw))) {
      return cat.label;
    }
  }
  return null;
}