import { Worker } from "bullmq";
import { COLLECT_QUEUE, connection, type CollectJob } from "./queues.js";
import { db, type CollectResult, type LeadInput, type Source } from "./db.js";
import { collectApi } from "./collectors/api.js";
import { collectWeb } from "./collectors/web.js";
import { leadScore } from "./score.js";
import { sendLeadCard, type Lead } from "./leads.js";
import { escapeHtml, notify } from "./telegram.js";

/** Máximo de avisos individuales por ejecución; el resto se resume en un solo mensaje. */
const MAX_INDIVIDUAL_NOTIFICATIONS = 5;

const LEAD_SELECT = "id, name, company, email, phone, city, notes, status, website, next_followup, lat, lng, address";

/** Un duplicado por id externo completa la ubicación del prospecto ya guardado (si aún no la tiene). */
async function enrichExisting(sourceId: string, lead: LeadInput) {
  if (!lead.external_id || (lead.lat == null && !lead.address)) return;
  const patch: Record<string, unknown> = {};
  if (lead.lat != null && lead.lng != null) Object.assign(patch, { lat: lead.lat, lng: lead.lng });
  if (lead.address) patch.address = lead.address;
  await db.from("leads").update(patch).eq("source_id", sourceId).eq("external_id", lead.external_id).is("lat", null);
}

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
    const created: Lead[] = [];

    for (const lead of found) {
      const row: Record<string, unknown> = { ...lead, score: lead.score ?? leadScore(lead), source_id: source.id };
      // Las columnas opcionales solo se envían si traen dato (así no fallan si falta la migración correspondiente).
      for (const key of ["external_id", "lat", "lng", "address"]) if (row[key] == null) delete row[key];

      // Se omiten duplicados (índices únicos por email / website / external_id).
      let { data, error: insertError } = await db.from("leads").insert(row).select(LEAD_SELECT).maybeSingle();

      // Falta la migración 0010 (ubicación): se guarda el prospecto sin esos campos.
      if (insertError && (insertError.code === "42703" || insertError.code === "PGRST204") && /lat|lng|address/.test(insertError.message)) {
        delete row.lat;
        delete row.lng;
        delete row.address;
        ({ data, error: insertError } = await db.from("leads").insert(row).select(LEAD_SELECT).maybeSingle());
      }

      if (insertError) {
        if (insertError.code === "23505") {
          await enrichExisting(source.id, lead);
          continue;
        }
        throw insertError;
      }
      if (data) created.push(data as Lead);
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

async function announce(sourceName: string, created: Lead[]) {
  for (const lead of created.slice(0, MAX_INDIVIDUAL_NOTIFICATIONS)) {
    await sendLeadCard(lead, "Nuevo prospecto", `
Fuente: ${escapeHtml(sourceName)}`);
  }
  const rest = created.length - MAX_INDIVIDUAL_NOTIFICATIONS;
  if (rest > 0) {
    await notify(`➕ ${rest} prospectos más de <b>${escapeHtml(sourceName)}</b>. Escribe /pendientes o míralos en el dashboard.`);
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
