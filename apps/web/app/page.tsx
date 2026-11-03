import { Suspense } from "react";
import { createClient } from "@/lib/server";

const STATUS_LABEL: Record<string, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  replied: "Respondió",
  qualified: "Calificado",
  won: "Ganado",
  lost: "Perdido",
};

const STATUS_STYLE: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  contacted: "bg-amber-100 text-amber-800",
  replied: "bg-violet-100 text-violet-800",
  qualified: "bg-emerald-100 text-emerald-800",
  won: "bg-green-200 text-green-900",
  lost: "bg-zinc-200 text-zinc-700",
};

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("es", { dateStyle: "short", timeStyle: "short" }) : "—";

export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-zinc-500">Cargando…</p>}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const supabase = await createClient();

  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const [leads, total, week, sources, runs] = await Promise.all([
    supabase
      .from("leads")
      .select("id, name, company, email, phone, status, score, created_at, sources(name)")
      .order("created_at", { ascending: false })
      .limit(25),
    supabase.from("leads").select("*", { count: "exact", head: true }),
    supabase.from("leads").select("*", { count: "exact", head: true }).gte("created_at", since),
    supabase.from("sources").select("id, name, kind, enabled, scraping_allowed, cron, last_run_at"),
    supabase
      .from("job_runs")
      .select("id, status, found, inserted, error, started_at, sources(name)")
      .order("started_at", { ascending: false })
      .limit(8),
  ]);

  const byStatus = (leads.data ?? []).reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1;
    return acc;
  }, {});

  const stats = [
    { label: "Prospectos totales", value: total.count ?? 0 },
    { label: "Últimos 7 días", value: week.count ?? 0 },
    { label: "Fuentes activas", value: (sources.data ?? []).filter((s) => s.enabled).length },
    { label: "Calificados (recientes)", value: byStatus.qualified ?? 0 },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Prospecta</h1>
        <form action="/auth/signout" method="post">
          <button className="text-sm text-zinc-500 hover:underline">Salir</button>
        </form>
      </header>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border p-4">
            <p className="text-sm text-zinc-500">{s.label}</p>
            <p className="mt-1 text-3xl font-semibold">{s.value}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Prospectos recientes</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="p-3">Nombre</th>
                <th className="p-3">Contacto</th>
                <th className="p-3">Fuente</th>
                <th className="p-3">Estado</th>
                <th className="p-3">Score</th>
                <th className="p-3">Creado</th>
              </tr>
            </thead>
            <tbody>
              {(leads.data ?? []).map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{l.name}</div>
                    {l.company && <div className="text-zinc-500">{l.company}</div>}
                  </td>
                  <td className="p-3">
                    <div>{l.email ?? "—"}</div>
                    <div className="text-zinc-500">{l.phone ?? ""}</div>
                  </td>
                  <td className="p-3">{(l.sources as { name?: string } | null)?.name ?? "—"}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[l.status]}`}>
                      {STATUS_LABEL[l.status] ?? l.status}
                    </span>
                  </td>
                  <td className="p-3">{l.score}</td>
                  <td className="p-3">{fmt(l.created_at)}</td>
                </tr>
              ))}
              {!leads.data?.length && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-zinc-500">
                    Aún no hay prospectos. Agrega una fuente y el worker los traerá.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-medium">Fuentes</h2>
          <ul className="divide-y rounded-lg border">
            {(sources.data ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-zinc-500">
                    {s.kind} · {s.cron ?? "sin cron"} · última: {fmt(s.last_run_at)}
                  </div>
                </div>
                <span className="text-xs text-zinc-500">
                  {s.enabled ? "activa" : "pausada"}
                  {s.kind === "web" && !s.scraping_allowed ? " · scraping no autorizado" : ""}
                </span>
              </li>
            ))}
            {!sources.data?.length && <li className="p-4 text-sm text-zinc-500">Sin fuentes.</li>}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium">Últimas ejecuciones</h2>
          <ul className="divide-y rounded-lg border">
            {(runs.data ?? []).map((r) => (
              <li key={r.id} className="p-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">{(r.sources as { name?: string } | null)?.name ?? "—"}</span>
                  <span className={r.status === "failed" ? "text-red-600" : "text-zinc-500"}>{r.status}</span>
                </div>
                <div className="text-zinc-500">
                  {fmt(r.started_at)} · {r.inserted}/{r.found} nuevos
                </div>
                {r.error && <div className="text-red-600">{r.error}</div>}
              </li>
            ))}
            {!runs.data?.length && <li className="p-4 text-sm text-zinc-500">Sin ejecuciones.</li>}
          </ul>
        </section>
      </div>
    </main>
  );
}
