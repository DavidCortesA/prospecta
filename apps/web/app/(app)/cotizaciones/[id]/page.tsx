import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/server";
import { QUOTE_LABEL, QUOTE_STATUSES, QUOTE_TONE, type QuoteStatus } from "@/lib/constants";
import { dateShort, money } from "@/lib/format";
import { businessName, calcTotals, quoteNumber } from "@/lib/quotes";
import { Badge, btn } from "@/components/ui-kit";
import { CopyButton, PrintButton } from "@/components/quote-actions";
import { deleteQuote, setQuoteStatus } from "../actions";

export default function Page(props: PageProps<"/cotizaciones/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-secondary" />}>
      <Detail params={props.params} />
    </Suspense>
  );
}

type Item = { id: string; name: string; description: string | null; qty: number; unit_price: number; position: number };

async function Detail({ params }: { params: PageProps<"/cotizaciones/[id]">["params"] }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: q } = await supabase.from("quotes").select("*, quote_items(*)").eq("id", id).maybeSingle();
  if (!q) notFound();

  const items = ((q.quote_items ?? []) as Item[]).sort((a, b) => a.position - b.position);
  const t = calcTotals(items, Number(q.discount_pct), Number(q.tax_pct));
  const number = quoteNumber(q.number);
  const status = q.status as QuoteStatus;

  const summary = [
    `${businessName} — ${number}: ${q.title}`,
    `Para: ${q.customer_name}${q.customer_company ? ` (${q.customer_company})` : ""}`,
    "",
    ...items.map((i) => `• ${i.name}${i.qty !== 1 ? ` x${i.qty}` : ""}: ${money(i.qty * i.unit_price, q.currency)}`),
    "",
    ...(t.discount ? [`Descuento: -${money(t.discount, q.currency)}`] : []),
    ...(t.tax ? [`Impuesto: ${money(t.tax, q.currency)}`] : []),
    `TOTAL: ${money(t.total, q.currency)}`,
    ...(q.valid_until ? [`Válida hasta: ${dateShort(q.valid_until)}`] : []),
  ].join("\n");

  return (
    <div className="space-y-6">
      <div className="no-print space-y-4">
        <Link href="/cotizaciones" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Cotizaciones
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Badge className={QUOTE_TONE[status]}>{QUOTE_LABEL[status]}</Badge>
            <div className="flex flex-wrap gap-1.5">
              {QUOTE_STATUSES.filter((s) => s !== status).map((s) => (
                <form key={s} action={setQuoteStatus.bind(null, q.id, s)}>
                  <button className={`${btn.outline} px-3 py-1.5 text-xs`}>
                    {s === "sent" ? "Marcar enviada" : s === "accepted" ? "Aceptada ✓" : s === "rejected" ? "Rechazada" : "A borrador"}
                  </button>
                </form>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={summary} />
            <PrintButton />
          </div>
        </div>
        {status !== "accepted" && q.lead_id && (
          <p className="text-xs text-muted-foreground">
            Al marcarla <strong>enviada</strong> el prospecto pasa a Calificado; al marcarla <strong>aceptada</strong> se gana, se crea el cliente y su proyecto.
          </p>
        )}
      </div>

      {/* Documento imprimible */}
      <article className="mx-auto max-w-3xl rounded-2xl border bg-white p-8 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-12">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-sidebar text-lg font-extrabold text-sidebar-primary">{businessName[0]}</span>
              <p className="text-lg font-extrabold tracking-tight">{businessName}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Cotización</p>
            <p className="text-2xl font-extrabold tracking-tight">{number}</p>
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
            {items.map((i) => (
              <tr key={i.id} className="align-top">
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

      <form action={deleteQuote.bind(null, q.id)} className="no-print text-center">
        <button className={`${btn.ghost} text-rose-600 hover:text-rose-700`}>Eliminar cotización</button>
      </form>
    </div>
  );
}
