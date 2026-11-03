import { dateShort, money } from "@/lib/format";
import { businessName, calcTotals, quoteNumber } from "@/lib/quotes";

export type QuoteDoc = {
  number: number;
  title: string;
  currency: string;
  discount_pct: number | string;
  tax_pct: number | string;
  valid_until: string | null;
  notes: string | null;
  customer_name: string;
  customer_company: string | null;
  customer_email?: string | null;
  created_at: string;
};

export type QuoteDocItem = {
  name: string;
  description: string | null;
  qty: number;
  unit_price: number;
};

/** Documento de la cotización: se usa en el dashboard (imprimible) y en la página pública del cliente. */
export function QuoteDocument({ quote: q, items }: { quote: QuoteDoc; items: QuoteDocItem[] }) {
  const t = calcTotals(items, Number(q.discount_pct), Number(q.tax_pct));

  return (
    <article className="mx-auto max-w-3xl rounded-2xl border bg-white p-8 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-12">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-sidebar text-lg font-extrabold text-sidebar-primary">{businessName[0]}</span>
          <p className="text-lg font-extrabold tracking-tight">{businessName}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Cotización</p>
          <p className="text-2xl font-extrabold tracking-tight">{quoteNumber(q.number)}</p>
          <p className="text-xs text-muted-foreground">Emitida {dateShort(q.created_at)}</p>
          {q.valid_until && <p className="text-xs text-muted-foreground">Válida hasta {dateShort(q.valid_until)}</p>}
        </div>
      </header>

      <section className="grid gap-4 py-6 sm:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Para</p>
          <p className="mt-1 font-bold">{q.customer_name}</p>
          {q.customer_company && <p className="text-sm">{q.customer_company}</p>}
          {q.customer_email && <p className="text-sm text-muted-foreground">{q.customer_email}</p>}
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Proyecto</p>
          <p className="mt-1 font-bold">{q.title}</p>
        </div>
      </section>

      <table className="w-full text-left text-sm">
        <thead className="border-y text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="py-3 font-semibold">Concepto</th>
            <th className="w-16 py-3 text-center font-semibold">Cant.</th>
            <th className="w-28 py-3 text-right font-semibold">Precio</th>
            <th className="w-28 py-3 text-right font-semibold">Importe</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((i, idx) => (
            <tr key={idx} className="align-top">
              <td className="py-3 pr-3">
                <p className="font-semibold">{i.name}</p>
                {i.description && <p className="mt-0.5 text-xs text-muted-foreground">{i.description}</p>}
              </td>
              <td className="py-3 text-center">{i.qty}</td>
              <td className="py-3 text-right">{money(i.unit_price, q.currency)}</td>
              <td className="py-3 text-right font-semibold">{money(i.qty * i.unit_price, q.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ml-auto mt-6 w-full max-w-xs space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="font-semibold">{money(t.subtotal, q.currency)}</dd>
        </div>
        {t.discount > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Descuento ({Number(q.discount_pct)}%)</dt>
            <dd className="font-semibold">− {money(t.discount, q.currency)}</dd>
          </div>
        )}
        {t.tax > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Impuesto ({Number(q.tax_pct)}%)</dt>
            <dd className="font-semibold">{money(t.tax, q.currency)}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between border-t pt-3">
          <dt className="font-bold">Total</dt>
          <dd className="text-2xl font-extrabold">{money(t.total, q.currency)}</dd>
        </div>
      </dl>

      {q.notes && (
        <section className="mt-8 border-t pt-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Notas y condiciones</p>
          <p className="mt-2 whitespace-pre-line text-sm">{q.notes}</p>
        </section>
      )}
    </article>
  );
}
