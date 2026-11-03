import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/server";
import { QUOTE_LABEL, QUOTE_STATUSES, QUOTE_TONE, type QuoteStatus } from "@/lib/constants";
import { dateShort, money } from "@/lib/format";
import { calcTotals, quoteNumber } from "@/lib/quotes";
import { Badge, Card, EmptyState, LinkButton, MigrationNotice, PageHeader, StatCard, TableShell, isMissingTable } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export const metadata = { title: "Cotizaciones" };

export default function Page(props: PageProps<"/cotizaciones">) {
  return (
    <>
      <PageHeader
        title="Cotizaciones"
        subtitle="Arma una cotización con las features que pide el cliente y envíala."
        actions={
          <LinkButton href="/cotizaciones/nueva">
            <Plus className="size-4" /> Nueva cotización
          </LinkButton>
        }
      />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-secondary" />}>
        <List searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/cotizaciones">["searchParams"] }) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" && (QUOTE_STATUSES as readonly string[]).includes(sp.status) ? sp.status : "";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .select("id, number, title, status, customer_name, customer_company, discount_pct, tax_pct, created_at, valid_until, quote_items(qty, unit_price)")
    .order("created_at", { ascending: false })
    .limit(300);

  if (isMissingTable(error)) return <MigrationNotice file="0004_catalog_quotes.sql" />;

  const quotes = (data ?? []).map((q) => ({
    ...q,
    total: calcTotals(q.quote_items as { qty: number; unit_price: number }[], Number(q.discount_pct), Number(q.tax_pct)).total,
  }));
  const sum = (s: string) => quotes.filter((q) => q.status === s).reduce((a, q) => a + q.total, 0);
  const count = (s: string) => quotes.filter((q) => q.status === s).length;
  const shown = status ? quotes.filter((q) => q.status === status) : quotes;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Borradores" value={count("draft")} />
        <StatCard label="Esperando respuesta" value={money(sum("sent"))} hint={`${count("sent")} enviadas`} tone="text-sky-700 bg-sky-100" />
        <StatCard label="Aceptado" value={money(sum("accepted"))} hint={`${count("accepted")} cotizaciones`} tone="text-emerald-700 bg-emerald-100" />
        <StatCard label="Rechazadas" value={count("rejected")} tone="text-rose-700 bg-rose-100" />
      </section>

      <div className="flex flex-wrap gap-2">
        {[["", "Todas"] as const, ...QUOTE_STATUSES.map((s) => [s, QUOTE_LABEL[s]] as const)].map(([s, label]) => (
          <Link
            key={s}
            href={s ? `/cotizaciones?status=${s}` : "/cotizaciones"}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 ring-inset transition",
              status === s ? "bg-sidebar text-sidebar-accent-foreground ring-sidebar" : "bg-card text-muted-foreground ring-border hover:text-foreground"
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      <Card>
        {shown.length ? (
          <TableShell>
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-semibold">Cotización</th>
                  <th className="px-3 py-3 font-semibold">Cliente</th>
                  <th className="px-3 py-3 font-semibold">Estado</th>
                  <th className="px-3 py-3 text-right font-semibold">Total</th>
                  <th className="hidden px-3 py-3 font-semibold md:table-cell">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((q) => (
                  <tr key={q.id} className="transition hover:bg-secondary/50">
                    <td className="px-5 py-3">
                      <Link href={`/cotizaciones/${q.id}`} className="font-semibold hover:text-primary">
                        {quoteNumber(q.number)}
                      </Link>
                      <p className="text-xs text-muted-foreground">{q.title}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p>{q.customer_name}</p>
                      <p className="text-xs text-muted-foreground">{q.customer_company}</p>
                    </td>
                    <td className="px-3 py-3">
                      <Badge className={QUOTE_TONE[q.status as QuoteStatus]}>{QUOTE_LABEL[q.status as QuoteStatus]}</Badge>
                    </td>
                    <td className="px-3 py-3 text-right font-bold">{money(q.total)}</td>
                    <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">{dateShort(q.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        ) : (
          <EmptyState
            title="No hay cotizaciones aquí"
            text="Crea la primera eligiendo las features que pidió tu cliente."
            action={<LinkButton href="/cotizaciones/nueva">Nueva cotización</LinkButton>}
          />
        )}
      </Card>
    </div>
  );
}
