import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Sparkles, Target, TrendingUp, Users, Zap } from "lucide-react";
import { createClient } from "@/lib/server";
import {
  APP_TZ,
  LEAD_STATUSES,
  STATUS_BAR,
  STATUS_LABEL,
  type LeadStatus,
} from "@/lib/constants";
import { dateTime, firstName, greeting, money, pct, timeAgo } from "@/lib/format";
import { buildInsights, type Insight } from "@/lib/insights";
import { Card, CardHeader, EmptyState, StatCard, StatusBadge, isMissingTable } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export const metadata = { title: "Resumen" };

const DAY = 24 * 3600 * 1000;
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ }).format(d);

export default function Page() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-secondary" />}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  const [leadsRes, sourcesRes, runsRes, quotesRes, projectsRes] = await Promise.all([
    supabase
      .from("leads")
      .select("id, name, company, status, score, created_at, updated_at, source_id")
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase.from("sources").select("id, name, enabled"),
    supabase
      .from("job_runs")
      .select("id, status, found, inserted, error, started_at, sources(name)")
      .order("started_at", { ascending: false })
      .limit(40),
    // Estas tablas llegan en migraciones posteriores; si no existen se ignoran.
    supabase.from("quotes").select("id, status, quote_items(qty, unit_price)").eq("status", "sent"),
    supabase.from("projects").select("id, status").neq("status", "delivered"),
  ]);

  if (isMissingTable(leadsRes.error)) {
    return (
      <Card className="p-6 text-sm">
        Falta crear las tablas base. Ejecuta <code>supabase/migrations/0001_init.sql</code> en Supabase.
      </Card>
    );
  }

  const leads = leadsRes.data ?? [];
  const sources = sourcesRes.data ?? [];
  const runs = runsRes.data ?? [];

  const now = Date.now();
  const byStatus: Record<string, number> = {};
  for (const l of leads) byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;

  const thisWeek = leads.filter((l) => now - +new Date(l.created_at) < 7 * DAY).length;
  const lastWeek = leads.filter((l) => {
    const age = now - +new Date(l.created_at);
    return age >= 7 * DAY && age < 14 * DAY;
  }).length;
  const staleContacted = leads.filter((l) => l.status === "contacted" && now - +new Date(l.updated_at) > 5 * DAY).length;
  const closed = (byStatus.won ?? 0) + (byStatus.lost ?? 0);
  const closeRate = closed ? pct(byStatus.won ?? 0, closed) : null;
  const failedRuns24h = runs.filter((r) => r.status === "failed" && now - +new Date(r.started_at) < DAY).length;

  const quotesAwaiting = quotesRes.error ? undefined : (quotesRes.data ?? []).length;
  const quotesAwaitingValue = quotesRes.error
    ? undefined
    : (quotesRes.data ?? []).reduce(
        (sum, q) =>
          sum + ((q.quote_items as { qty: number; unit_price: number }[] | null) ?? []).reduce((a, i) => a + i.qty * i.unit_price, 0),
        0
      );
  const activeProjects = projectsRes.error ? undefined : (projectsRes.data ?? []).length;

  const insights = buildInsights({
    total: leads.length,
    byStatus,
    thisWeek,
    lastWeek,
    staleContacted,
    closeRate,
    failedRuns24h,
    activeSources: sources.filter((s) => s.enabled).length,
    quotesAwaiting,
    quotesAwaitingValue,
    activeProjects,
  });

  // Últimos 14 días
  const days = Array.from({ length: 14 }, (_, i) => new Date(now - (13 - i) * DAY));
  const perDay = new Map(days.map((d) => [dayKey(d), 0]));
  for (const l of leads) {
    const k = dayKey(new Date(l.created_at));
    if (perDay.has(k)) perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  const dayMax = Math.max(1, ...perDay.values());

  // Embudo
  const funnel = LEAD_STATUSES.filter((s) => s !== "lost");
  const funnelMax = Math.max(1, ...funnel.map((s) => byStatus[s] ?? 0));

  // Rendimiento por fuente
  const sourceName = new Map(sources.map((s) => [s.id, s.name]));
  const bySource = new Map<string, { total: number; won: number }>();
  for (const l of leads) {
    const key = l.source_id ? (sourceName.get(l.source_id) ?? "Fuente eliminada") : "Manual";
    const cur = bySource.get(key) ?? { total: 0, won: 0 };
    cur.total++;
    if (l.status === "won") cur.won++;
    bySource.set(key, cur);
  }
  const topSources = [...bySource.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 5);

  const hot = leads
    .filter((l) => ["new", "replied", "qualified"].includes(l.status))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const name = firstName(claims?.claims?.email as string | undefined);
  const active = (byStatus.new ?? 0) + (byStatus.contacted ?? 0) + (byStatus.replied ?? 0) + (byStatus.qualified ?? 0);

  return (
    <div className="space-y-6">
      {/* Saludo + lo que hay que atender */}
      <section className="relative overflow-hidden rounded-3xl bg-sidebar p-6 text-sidebar-accent-foreground shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-sidebar-primary/20 blur-3xl" />
        <div className="relative">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-sidebar-primary">
            <Sparkles className="size-3.5" /> Resumen del día
          </p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
            {greeting()}
            {name ? `, ${name}` : ""}
          </h1>
          <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
            {insights.slice(0, 4).map((i, idx) => (
              <InsightItem key={idx} insight={i} />
            ))}
          </ul>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Prospectos" value={leads.length} hint={`${thisWeek} esta semana`} icon={<Users className="size-4" />} />
        <StatCard
          label="En proceso"
          value={active}
          hint="Nuevos, contactados, respondieron y calificados"
          icon={<Zap className="size-4" />}
          tone="text-sky-700 bg-sky-100"
        />
        <StatCard
          label="Tasa de cierre"
          value={closeRate === null ? "—" : `${closeRate}%`}
          hint={`${byStatus.won ?? 0} ganados · ${byStatus.lost ?? 0} perdidos`}
          icon={<Target className="size-4" />}
          tone="text-emerald-700 bg-emerald-100"
        />
        <StatCard
          label="Cotizado en espera"
          value={quotesAwaitingValue === undefined ? "—" : money(quotesAwaitingValue)}
          hint={quotesAwaiting === undefined ? "Se activa con las cotizaciones" : `${quotesAwaiting} cotizaciones enviadas`}
          icon={<TrendingUp className="size-4" />}
          tone="text-violet-700 bg-violet-100"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Prospectos por día" hint="Últimos 14 días" />
          <div className="flex h-44 items-end gap-1.5 px-5 pb-4 pt-6">
            {days.map((d) => {
              const v = perDay.get(dayKey(d)) ?? 0;
              return (
                <div key={dayKey(d)} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="text-[10px] font-semibold text-muted-foreground opacity-0 transition group-hover:opacity-100">{v}</span>
                  <div
                    className={cn("w-full rounded-t-md transition", v ? "bg-primary" : "bg-secondary")}
                    style={{ height: `${v ? Math.max(8, (v / dayMax) * 100) : 4}%` }}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {new Intl.DateTimeFormat("es", { weekday: "narrow", timeZone: APP_TZ }).format(d)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Embudo" hint="Dónde está cada prospecto" />
          <div className="space-y-3 p-5">
            {funnel.map((s) => {
              const v = byStatus[s] ?? 0;
              return (
                <div key={s}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-semibold">{STATUS_LABEL[s as LeadStatus]}</span>
                    <span className="text-muted-foreground">{v}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
                    <div className={cn("h-full rounded-full", STATUS_BAR[s as LeadStatus])} style={{ width: `${(v / funnelMax) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Para atender primero"
            hint="Nuevos, con respuesta o calificados, por score"
            action={<Link href="/prospectos" className="text-xs font-semibold text-primary hover:underline">Ver todos</Link>}
          />
          {hot.length ? (
            <ul className="divide-y">
              {hot.map((l) => (
                <li key={l.id}>
                  <Link href={`/prospectos/${l.id}`} className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-secondary/60">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{l.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{l.company ?? "Sin empresa"} · {timeAgo(l.created_at)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs font-bold text-muted-foreground">{l.score}</span>
                      <StatusBadge status={l.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nada pendiente" text="Cuando el bot traiga prospectos aparecerán aquí." />
          )}
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Mejores fuentes" hint="Prospectos y cierres por origen" />
            {topSources.length ? (
              <ul className="divide-y">
                {topSources.map(([name, v]) => (
                  <li key={name} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="truncate font-medium">{name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {v.total} prospectos · {v.won} ganados
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Sin datos todavía" />
            )}
          </Card>

          <Card>
            <CardHeader title="Actividad del bot" hint="Últimas ejecuciones" />
            {runs.length ? (
              <ul className="divide-y">
                {runs.slice(0, 5).map((r) => (
                  <li key={r.id} className="px-5 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{(r.sources as { name?: string } | null)?.name ?? "—"}</span>
                      <span className={cn("text-xs font-semibold", r.status === "failed" ? "text-rose-600" : r.status === "done" ? "text-emerald-600" : "text-amber-600")}>
                        {r.status === "done" ? "listo" : r.status === "failed" ? "falló" : "corriendo"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {dateTime(r.started_at)} · {r.inserted}/{r.found} nuevos
                    </p>
                    {r.error && <p className="mt-0.5 truncate text-xs text-rose-600">{r.error}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Sin ejecuciones" text="Aparecerán cuando una fuente con cron corra." />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function InsightItem({ insight }: { insight: Insight }) {
  const Icon = insight.tone === "warn" ? AlertTriangle : insight.tone === "good" ? CheckCircle2 : Sparkles;
  const color = insight.tone === "warn" ? "text-amber-300" : insight.tone === "good" ? "text-emerald-300" : "text-sky-300";
  return (
    <li className="flex gap-2.5 rounded-xl bg-white/5 p-3 text-sm leading-snug ring-1 ring-white/10">
      <Icon className={cn("mt-0.5 size-4 shrink-0", color)} />
      <span>{insight.text}</span>
    </li>
  );
}
