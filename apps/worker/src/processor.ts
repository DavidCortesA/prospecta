import { Worker } from "bullmq";
import { COLLECT_QUEUE, connection, type CollectJob } from "./queues.js";
import { db, type LeadInput, type Source } from "./db.js";
import { collectApi } from "./collectors/api.js";
import { collectWeb } from "./collectors/web.js";
import { escapeHtml, notify } from "./telegram.js";

async function collect(source: Source): Promise<LeadInput[]> {
  switch (source.kind) {
    case "api":
      return collectApi(source);
    case "web":
      return collectWeb(source);
    default:
      return []; // csv / manual se cargan desde el dashboard
  }
}

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
    const found = await collect(source);
    let inserted = 0;

    for (const lead of found) {
      const row = { ...lead, source_id: source.id };
      // Se omiten duplicados (índices únicos por email / website).
      const { data, error: insertError } = await db
        .from("leads")
        .insert(row)
        .select("id, name, company, email, phone")
        .maybeSingle();

      if (insertError) {
        if (insertError.code === "23505") continue;
        throw insertError;
      }
      if (data) {
        inserted++;
        await notify(
          `🆕 <b>Nuevo prospecto</b>\n${escapeHtml(data.name)}` +
            (data.company ? ` — ${escapeHtml(data.company)}` : "") +
            (data.email ? `\n✉️ ${escapeHtml(data.email)}` : "") +
            (data.phone ? `\n📞 ${escapeHtml(data.phone)}` : "") +
            `\nFuente: ${escapeHtml(source.name)}`
        );
      }
    }

    await db.from("sources").update({ last_run_at: new Date().toISOString() }).eq("id", source.id);
    await db
      .from("job_runs")
      .update({ status: "done", found: found.length, inserted, finished_at: new Date().toISOString() })
      .eq("id", run?.id);
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

export function startProcessor() {
  const worker = new Worker<CollectJob>(COLLECT_QUEUE, (job) => process(job.data.sourceId), {
    connection,
    concurrency: 2,
  });
  worker.on("failed", (job, err) => console.error(`Job ${job?.id} falló:`, err.message));
  return worker;
}
