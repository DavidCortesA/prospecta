import { Suspense } from "react";
import { MapPinned, Pause, Play, PlayCircle, Plus, RotateCcw, Trash2 } from "lucide-react";
import { createClient } from "@/lib/server";
import { dateTime, timeAgo } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, btn, inputCls } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { CRON_PRESETS as WIZARD_CRONS, DENUE_GIROS, DENUE_MUNICIPIOS, DENUE_MUNICIPIOS_ORDER } from "@/lib/denue";
import { createDenueSource, createSource, deleteSource, resetCursor, runSourceNow, toggleSource, updateSource } from "./actions";

export const metadata = { title: "Fuentes" };

const KIND_LABEL: Record<string, string> = { api: "API", web: "Web (Playwright)", csv: "CSV", manual: "Manual" };

const CRON_PRESETS = [
  ["*/30 * * * *", "Cada 30 minutos"],
  ["0 * * * *", "Cada hora"],
  ["0 */6 * * *", "Cada 6 horas"],
  ["0 9 * * *", "Todos los días a las 9:00"],
  ["0 9 * * 1", "Los lunes a las 9:00"],
];

export default function Page(props: PageProps<"/fuentes">) {
  return (
    <>
      <PageHeader title="Fuentes" subtitle="De dónde trae prospectos el bot, cada cuánto y con qué permisos." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-secondary" />}>
        <Sources searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

function SourceForm({
  action,
  s,
  submit,
}: {
  action: (fd: FormData) => Promise<void>;
  s?: { name: string; kind: string; url: string | null; cron: string | null; config: unknown; scraping_allowed: boolean };
  submit: string;
}) {
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1.5">
        <span className="text-xs font-semibold text-muted-foreground">Nombre *</span>
        <input name="name" required defaultValue={s?.name} className={inputCls} />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-semibold text-muted-foreground">Tipo</span>
        <select name="kind" defaultValue={s?.kind ?? "api"} className={inputCls}>
          {Object.entries(KIND_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1.5 sm:col-span-2">
        <span className="text-xs font-semibold text-muted-foreground">URL</span>
        <input name="url" defaultValue={s?.url ?? ""} placeholder="https://…" className={inputCls} />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-semibold text-muted-foreground">Cron (programación)</span>
        <input name="cron" list="cron-presets" defaultValue={s?.cron ?? ""} placeholder="0 9 * * *" className={inputCls} />
      </label>
      <label className="flex items-end gap-2 pb-2 text-sm">
        <input type="checkbox" name="scraping_allowed" defaultChecked={s?.scraping_allowed} className="size-4 accent-[var(--primary)]" />
        <span>
          <strong>Scraping autorizado</strong>
          <span className="block text-xs text-muted-foreground">Solo si revisaste los términos del sitio.</span>
        </span>
      </label>
      <label className="space-y-1.5 sm:col-span-2">
        <span className="text-xs font-semibold text-muted-foreground">Configuración (JSON, para APIs)</span>
        <textarea
          name="config"
          rows={3}
          defaultValue={s && Object.keys(s.config as object).length ? JSON.stringify(s.config, null, 2) : ""}
          placeholder='{"itemsPath":"results","map":{"name":"name","email":"email"}}'
          className={cn(inputCls, "font-mono text-xs")}
        />
      </label>
      <div className="sm:col-span-2">
        <button className={btn.primary}>{submit}</button>
      </div>
    </form>
  );
}

async function Sources({ searchParams }: { searchParams: PageProps<"/fuentes">["searchParams"] }) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: sources }, { data: runs }, { data: leads }] = await Promise.all([
    supabase.from("sources").select("*").order("created_at", { ascending: false }),
    supabase.from("job_runs").select("source_id, status, found, inserted, error, started_at").order("started_at", { ascending: false }).limit(300),
    supabase.from("leads").select("source_id").limit(5000),
  ]);

  const leadCount = new Map<string, number>();
  for (const l of leads ?? []) if (l.source_id) leadCount.set(l.source_id, (leadCount.get(l.source_id) ?? 0) + 1);
  const lastRun = new Map<string, NonNullable<typeof runs>[number]>();
  for (const r of runs ?? []) if (r.source_id && !lastRun.has(r.source_id)) lastRun.set(r.source_id, r);

  return (
    <div className="space-y-6">
      {typeof error === "string" && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <datalist id="cron-presets">
        {CRON_PRESETS.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </datalist>

      <details className="group rounded-2xl border border-primary/30 bg-primary/5 shadow-sm" open={!sources?.length}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-bold">
          <MapPinned className="size-4 text-primary" /> Asistente DENUE · negocios reales de Nuevo León
        </summary>
        <form action={createDenueSource} className="grid gap-3 border-t border-primary/20 p-5 sm:grid-cols-2">
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Elige el giro y el municipio y se arma solo la fuente (URL, mapeo y filtros). Un giro necesita municipio; «Todo Nuevo León» solo sirve con palabra clave. Necesita la variable <code>DENUE_TOKEN</code> en el worker.
          </p>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Giro</span>
            <select name="giro" defaultValue="621211" className={inputCls}>
              {DENUE_GIROS.map((g) => (
                <option key={g.code} value={g.code}>
                  {g.label}
                </option>
              ))}
              <option value="">Otro: usar palabra clave →</option>
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Palabra clave (solo si eliges "Otro")</span>
            <input name="keyword" placeholder="taller eléctrico, lavandería…" className={inputCls} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Municipio</span>
            <select name="municipio" defaultValue="039" className={inputCls}>
              <option value="">Todo Nuevo León (solo con palabra clave)</option>
              {DENUE_MUNICIPIOS_ORDER.map((c) => (
                <option key={c} value={c}>
                  {DENUE_MUNICIPIOS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Frecuencia</span>
            <select name="cron" defaultValue="0 9 * * *" className={inputCls}>
              {WIZARD_CRONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="only_no_website" defaultChecked className="mt-0.5 size-4 accent-[var(--primary)]" />
            <span>
              <strong>Solo negocios sin sitio web</strong>
              <span className="block text-xs text-muted-foreground">Los mejores prospectos si vendes páginas o sistemas.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="only_contactable" defaultChecked className="mt-0.5 size-4 accent-[var(--primary)]" />
            <span>
              <strong>Solo con teléfono o correo</strong>
              <span className="block text-xs text-muted-foreground">Si no hay forma de contactarlos, no se guardan.</span>
            </span>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Negocios revisados por ejecución</span>
            <select name="page_size" defaultValue="50" className={inputCls}>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </label>
          <div className="flex items-end sm:justify-end">
            <button className={btn.primary}>Crear fuente DENUE</button>
          </div>
        </form>
      </details>

      <details className="group rounded-2xl border bg-card shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-bold">
          <Plus className="size-4 text-primary" /> Nueva fuente
        </summary>
        <div className="border-t p-5">
          <SourceForm action={createSource} submit="Crear fuente" />
        </div>
      </details>

      {sources?.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {sources.map((s) => {
            const run = lastRun.get(s.id);
            const pending = !!s.run_requested_at;
            return (
              <Card key={s.id} className="flex flex-col">
                <div className="flex items-start justify-between gap-3 p-5">
                  <div className="min-w-0">
                    <h3 className="truncate font-bold">{s.name}</h3>
                    <p className="truncate text-xs text-muted-foreground">{s.url ?? "Sin URL"}</p>
                  </div>
                  <Badge className={s.enabled ? "bg-emerald-100 text-emerald-800 ring-emerald-200" : "bg-zinc-100 text-zinc-600 ring-zinc-200"}>
                    {s.enabled ? "Activa" : "Pausada"}
                  </Badge>
                </div>

                <dl className="grid grid-cols-3 gap-3 border-y bg-secondary/40 px-5 py-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Tipo</dt>
                    <dd className="mt-0.5 font-semibold">{KIND_LABEL[s.kind] ?? s.kind}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Programación</dt>
                    <dd className="mt-0.5 font-mono font-semibold">{s.cron ?? "manual"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Prospectos</dt>
                    <dd className="mt-0.5 font-semibold">{leadCount.get(s.id) ?? 0}</dd>
                  </div>
                </dl>

                <div className="space-y-1 px-5 py-3 text-xs text-muted-foreground">
                  <p>
                    Última ejecución: <span className="font-semibold text-foreground">{s.last_run_at ? `${timeAgo(s.last_run_at)} (${dateTime(s.last_run_at)})` : "nunca"}</span>
                    {run && ` · ${run.inserted}/${run.found} nuevos`}
                  </p>
                  {run?.status === "failed" && run.error && <p className="text-rose-600">Error: {run.error}</p>}
                  {s.kind === "web" && !s.scraping_allowed && <p className="text-amber-700">Scraping no autorizado: esta fuente no se ejecutará.</p>}
                  {pending && <p className="font-semibold text-primary">Ejecución solicitada, el bot la tomará en unos segundos…</p>}
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-2 border-t px-5 py-3">
                  <form action={runSourceNow.bind(null, s.id)}>
                    <button disabled={!s.enabled || pending} className={`${btn.outline} px-3 py-1.5 text-xs`}>
                      <PlayCircle className="size-3.5" /> Ejecutar ahora
                    </button>
                  </form>
                  {Number((s.config as { cursor?: number })?.cursor ?? 0) > 0 && (
                    <form action={resetCursor.bind(null, s.id)}>
                      <button title="Volver a la primera página de resultados" className={`${btn.ghost} text-xs`}>
                        <RotateCcw className="size-3.5" /> Reiniciar ({Number((s.config as { cursor?: number }).cursor)})
                      </button>
                    </form>
                  )}
                  <form action={toggleSource.bind(null, s.id, !s.enabled)}>
                    <button className={`${btn.ghost} text-xs`}>
                      {s.enabled ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                      {s.enabled ? "Pausar" : "Activar"}
                    </button>
                  </form>
                  <form action={deleteSource.bind(null, s.id)} className="ml-auto">
                    <button aria-label="Eliminar fuente" className={`${btn.ghost} text-rose-600 hover:text-rose-700`}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </form>
                </div>

                <details className="border-t">
                  <summary className="cursor-pointer list-none px-5 py-3 text-xs font-semibold text-primary">Editar fuente</summary>
                  <div className="border-t p-5">
                    <SourceForm action={updateSource.bind(null, s.id)} s={s} submit="Guardar cambios" />
                  </div>
                </details>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState title="Aún no hay fuentes" text="Crea la primera con el botón de arriba. El bot la programará según su cron." />
        </Card>
      )}
    </div>
  );
}
