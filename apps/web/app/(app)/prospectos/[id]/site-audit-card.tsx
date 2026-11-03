import { CheckCircle2, ExternalLink, Search } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { Card, CardHeader, MigrationNotice, btn } from "@/components/ui-kit";
import { dateTime, timeAgo } from "@/lib/format";
import { normalizeWebsite } from "@/lib/templates";
import { cn } from "@/lib/utils";
import { requestSiteAudit } from "../actions";

export type SiteAudit = {
  id: string;
  url: string;
  status: "pending" | "running" | "done" | "failed";
  score: number | null;
  headline: string | null;
  metrics: Record<string, unknown> | null;
  issues: { code: string; severity: "high" | "medium" | "low"; title: string; detail: string }[] | null;
  screenshot: string | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

const SEVERITY_DOT = { high: "bg-rose-500", medium: "bg-amber-500", low: "bg-yellow-400" } as const;
const SEVERITY_LABEL = { high: "Grave", medium: "Importante", low: "Menor" } as const;

const scoreTone = (s: number) => (s >= 80 ? "text-emerald-600" : s >= 50 ? "text-amber-600" : "text-rose-600");
const seconds = (ms: unknown) => (typeof ms === "number" && ms > 0 ? `${(ms / 1000).toFixed(1)} s` : "—");

export function SiteAuditCard({
  leadId,
  website,
  audit,
  tableMissing,
}: {
  leadId: string;
  website: string | null;
  audit: SiteAudit | null;
  tableMissing: boolean;
}) {
  const url = normalizeWebsite(website);
  const running = audit?.status === "pending" || audit?.status === "running";
  const m = audit?.metrics ?? {};

  return (
    <Card>
      <CardHeader title="Sitio web" hint="Revisión como si se abriera desde un celular" />
      {tableMissing ? (
        <div className="p-5">
          <MigrationNotice file="0011_site_audits.sql" />
        </div>
      ) : !url ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          Este prospecto <strong>no tiene sitio web</strong>: es una oportunidad directa para ofrecerle uno.
        </p>
      ) : (
        <div className="space-y-4 p-5">
          <AutoRefresh active={running} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
              <span className="truncate">{url}</span>
              <ExternalLink className="size-3.5 shrink-0" />
            </a>
            <form action={requestSiteAudit.bind(null, leadId)}>
              <button disabled={running} className={`${btn.outline} px-3 py-1.5 text-xs`}>
                <Search className="size-3.5" /> {running ? "Revisando…" : audit ? "Volver a revisar" : "Revisar sitio"}
              </button>
            </form>
          </div>

          {running && (
            <p className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <Search className="mr-1.5 inline size-4 align-text-bottom" /> El bot está abriendo el sitio en un celular virtual. Tarda menos de un minuto y esta tarjeta se actualiza sola.
            </p>
          )}

          {audit?.status === "failed" && (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
              No se pudo revisar: {audit.error ?? "error desconocido"} <span className="text-rose-600/70">· {timeAgo(audit.finished_at ?? audit.created_at)}</span>
            </p>
          )}

          {audit?.status === "done" && audit.score !== null && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start gap-5">
                <div className="flex shrink-0 flex-col items-center rounded-2xl bg-secondary/60 px-6 py-4">
                  <span className={cn("text-4xl font-extrabold leading-none", scoreTone(audit.score))}>{audit.score}</span>
                  <span className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Salud del sitio</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Argumento de venta</p>
                  <p className="mt-1 text-sm leading-relaxed">
                    “Noté que {audit.headline}.”
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground" title={dateTime(audit.finished_at)}>
                    Revisado {timeAgo(audit.finished_at ?? audit.created_at)}
                  </p>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                {[
                  ["Carga (celular)", seconds(m.lcpMs ?? m.loadMs)],
                  ["Peso", typeof m.bytes === "number" ? `${((m.bytes as number) / 1_000_000).toFixed(1)} MB` : "—"],
                  ["HTTPS", m.https === true ? "Sí" : m.https === false ? "No" : "—"],
                  ["Solicitudes", typeof m.requests === "number" ? String(m.requests) : "—"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border px-3 py-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="mt-0.5 text-sm font-bold">{value}</dd>
                  </div>
                ))}
              </dl>

              {audit.issues?.length ? (
                <ul className="divide-y rounded-xl border">
                  {audit.issues.map((i) => (
                    <li key={i.code} className="flex gap-3 px-4 py-3">
                      <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", SEVERITY_DOT[i.severity])} title={SEVERITY_LABEL[i.severity]} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {i.title} <span className="text-[11px] font-medium text-muted-foreground">· {SEVERITY_LABEL[i.severity]}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">{i.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="mr-1.5 inline size-4 align-text-bottom" /> No se encontraron problemas importantes.</p>
              )}

              {audit.screenshot && (
                <details>
                  <summary className="cursor-pointer text-xs font-semibold text-primary">Ver cómo se ve en un celular</summary>
                  <div className="mt-3 flex justify-center rounded-xl bg-secondary/60 p-4">
                    {/* Captura guardada como data URL; next/image no aplica */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={audit.screenshot} alt="Captura del sitio en un celular" className="w-56 rounded-2xl border-4 border-sidebar shadow-lg" />
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
