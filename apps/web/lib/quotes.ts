export type QuoteItemInput = {
  feature_id: string | null;
  name: string;
  description: string | null;
  qty: number;
  unit_price: number;
};

export type QuoteInput = {
  title: string;
  lead_id: string | null;
  client_id: string | null;
  customer_name: string;
  customer_company: string | null;
  customer_email: string | null;
  discount_pct: number;
  tax_pct: number;
  valid_until: string | null;
  notes: string | null;
  items: QuoteItemInput[];
};

export function calcTotals(items: { qty: number; unit_price: number }[], discountPct = 0, taxPct = 0) {
  const subtotal = items.reduce((a, i) => a + i.qty * i.unit_price, 0);
  const discount = subtotal * (discountPct / 100);
  const taxable = subtotal - discount;
  const tax = taxable * (taxPct / 100);
  return { subtotal, discount, taxable, tax, total: taxable + tax };
}

export const quoteNumber = (n: number) => `COT-${String(n).padStart(4, "0")}`;

export const businessName = process.env.NEXT_PUBLIC_BUSINESS_NAME || "Prospecta";
