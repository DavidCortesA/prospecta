import { Worker } from "bullmq";
import { COLLECT_QUEUE, connection, type CollectJob } from "./queues.js";
import { db, type CollectResult, type Source } from "./db.js";
import { collectApi } from "./collectors/api.js";
import { collectWeb } from "./collectors/web.js";
import { leadScore } from "./score.js";
import { escapeHtml, notify } from "./telegram.js";

/** Máximo de avisos individuales por ejecución; el resto se resume en un solo mensaje. */
const MAX_INDIVIDUAL_NOTIFICATIONS = 5;

async function collect(source: Source): Promise<CollectResult> {
  switch (source.kind) {
    case "api":
      return collectApi(source);
    case "web":
      return collectWeb(source);
    default:
      return { leads: [] }; // csv / manual se cargan desde el dashboard
  }
}

type Inserted = { name: string; company: string | null; email: string | null; phone: string | null; city: string | null; notes: string | null };

async function process(sourceId: string) {
  const { data: source, error } = await db.from("sources").select("*").eq("id", sourceId).single<Source>();
  if (error || !source) throw new Error(`Fuente ${sourceId} no encontrada`);
  if (!source.enabled) return;

  const { data: run } = await db
    .from("job_runs")
    .insert({ source_id: source.id, queue: COLLECT_QUEUE })
    .select("id")
    .single();

  try {
    const { leads: found, nextConfig } = await collect(source);
    const created: Inserted[] = [];

    for (const lead of found) {
      const row: Record<string, unknown> = { ...lead, score: lead.score ?? leadScore(lead), source_id: source.id };
      // Sin id externo no se envía la columna (así funciona aunque falte la migración 0006).
      if (row.external_id == null) delete row.external_id;
      // Se omiten duplicados (índices únicos por email / website / external_id).
      const { data, error: insertError } = await db
        .from("leads")
        .insert(row)
        .select("name, company, email, phone, city, notes")
        .maybeSingle();

      if (insertError) {
        if (insertError.code === "23505") continue;
        throw insertError;
      }
      if (data) created.push(data as Inserted);
    }

    const patch: Record<string, unknown> = { last_run_at: new Date().toISOString() };
    if (nextConfig) patch.config = { ...source.config, ...nextConfig };
    await db.from("sources").update(patch).eq("id", source.id);

    await db
      .from("job_runs")
      .update({ status: "done", found: found.length, inserted: created.length, finished_at: new Date().toISOString() })
      .eq("id", run?.id);

    await announce(source.name, created);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from("job_runs")
      .update({ status: "failed", error: message, finished_at: new Date().toISOString() })
      .eq("id", run?.id);
    await notify(`⚠️ <b>Falló la fuente</b> ${escapeHtml(source.name)}\n${escapeHtml(message)}`);
    throw err;
  }
}

async function announce(sourceName: string, created: Inserted[]) {
  for (const l of created.slice(0, MAX_INDIVIDUAL_NOTIFICATIONS)) {
    await notify(
      `🆕 <b>Nuevo prospecto</b>\n${escapeHtml(l.name)}` +
        (l.company && l.company !== l.name ? ` — ${escapeHtml(l.company)}` : "") +
        (l.notes ? `\n🏷️ ${escapeHtml(l.notes.slice(0, 80))}` : "") +
        (l.city ? `\n📍 ${escapeHtml(l.city)}` : "") +
        (l.phone ? `\n📞 ${escapeHtml(l.phone)}` : "") +
        (l.email ? `\n✉️ ${escapeHtml(l.email)}` : "") +
        `\nFuente: ${escapeHtml(sourceName)}`
    );
  }
  const rest = created.length - MAX_INDIVIDUAL_NOTIFICATIONS;
  if (rest > 0) {
    await notify(`➕ ${rest} prospectos más de <b>${escapeHtml(sourceName)}</b>. Míralos en el dashboard.`);
  }
}

export function startProcessor() {
  const worker = new Worker<CollectJob>(COLLECT_QUEUE, (job) => process(job.data.sourceId), {
    connection,
    concurrency: 2,
  });
  worker.on("failed", (job, err) => console.error(`Job ${job?.id} falló:`, err.message));
  return worker;
}
