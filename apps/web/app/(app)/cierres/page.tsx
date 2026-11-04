import { Suspense } from "react";
import Link from "next/link";
import { Trophy, XCircle, Percent, Wallet } from "lucide-react";
import { connection } from "next/server";
import { dbRows } from "@/lib/db";
import { dateShort, money, pct } from "@/lib/format";
import { Card, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui-kit";

export const metadata = { title: "Cierres" };

export default function Page() {
  return (
    <>
      <PageHeader title="Cierres" subtitle="Qué prospectos se concretaron y cuáles no, y por qué." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-secondary" />}>
        <Closings />
      </Suspense>
    </>
  );
}

type Closed = { id: string; name: string; company: string | null; status: string; deal_value: number | null; lost_reason: string | null; closed_at: string | null };

async function Closings() {
  // Lectura en cada petición (antes lo marcaba createClient con las cookies)
  await connection();
  const { data } = await dbRows(
    "select id, name, company, status, deal_value, lost_reason, closed_at from leads where status in ('won', 'lost') order by closed_at desc nulls last limit 500"
  );

  const closed = (data ?? []) as Closed[];
  const won = closed.filter((l) => l.status === "won");
  const lost = closed.filter((l) => l.status === "lost");
  const revenue = won.reduce((a, l) => a + (l.deal_value ?? 0), 0);

  const reasons = new Map<string, number>();
  for (const l of lost) {
    const r = l.lost_reason?.trim().toLowerCase() || "sin motivo";
    reasons.set(r, (reasons.get(r) ?? 0) + 1);
  }
  const topReasons = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Concretados" value={won.length} icon={<Trophy className="size-4" />} tone="text-emerald-700 bg-emerald-100" />
        <StatCard label="No concretados" value={lost.length} icon={<XCircle className="size-4" />} tone="text-rose-700 bg-rose-100" />
        <StatCard label="Tasa de cierre" value={closed.length ? `${pct(won.length, closed.length)}%` : "—"} icon={<Percent className="size-4" />} />
        <StatCard label="Valor ganado" value={money(revenue)} hint="Suma del valor de los tratos" icon={<Wallet className="size-4" />} tone="text-violet-700 bg-violet-100" />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Se concretaron" hint="Ya son clientes" />
          {won.length ? (
            <ul className="divide-y">
              {won.map((l) => (
                <li key={l.id}>
                  <Link href={`/prospectos/${l.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm transition hover:bg-secondary/60">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{l.name}</span>
                      <span className="text-xs text-muted-foreground">{l.company ?? "Sin empresa"} · {dateShort(l.closed_at)}</span>
                    </span>
                    <span className="shrink-0 font-bold text-emerald-700">{l.deal_value != null ? money(l.deal_value) : "—"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Todavía no hay cierres ganados" />
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="No se concretaron" hint="Aprende de por qué se perdieron" />
            {lost.length ? (
              <ul className="divide-y">
                {lost.map((l) => (
                  <li key={l.id}>
                    <Link href={`/prospectos/${l.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm transition hover:bg-secondary/60">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{l.name}</span>
                        <span className="text-xs text-muted-foreground">{l.company ?? "Sin empresa"} · {dateShort(l.closed_at)}</span>
                      </span>
                      <span className="max-w-40 shrink-0 truncate text-xs font-semibold text-rose-700">{l.lost_reason ?? "Sin motivo"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Ninguno perdido por ahora" />
            )}
          </Card>

          {topReasons.length > 0 && (
            <Card>
              <CardHeader title="Motivos más comunes" />
              <ul className="divide-y">
                {topReasons.map(([reason, n]) => (
                  <li key={reason} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="capitalize">{reason}</span>
                    <span className="font-bold">{n}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
