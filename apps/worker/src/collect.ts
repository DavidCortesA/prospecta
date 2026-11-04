import { query, type CollectResult, type LeadInput, type Source } from "./db.js";
import { collectApi } from "./collectors/api.js";
import { collectWeb } from "./collectors/web.js";
import { leadScore } from "./score.js";
import { sendLeadCard, type Lead } from "./leads.js";
import { escapeHtml, notify } from "./telegram.js";

/** Nombre de la cola de ejecuciones en `job_runs` (el mismo que la cola de BullMQ del worker). */
export const RUN_QUEUE = "collect";

/** Máximo de avisos individuales por ejecución; el resto se resume en un solo mensaje. */
const MAX_INDIVIDUAL_NOTIFICATIONS = 5;

const LEAD_SELECT = "id, name, company, email, phone, city, notes, status, website, next_followup, lat, lng, address";

/** Columnas de `leads` que el worker escribe al insertar (lista fija: los nombres nunca vienen de datos externos). */
const LEAD_INSERT_COLUMNS = ["name", "company", "email", "phone", "website", "city", "notes", "score", "lat", "lng", "address", "external_id", "raw", "source_id"];

/** Inserta un prospecto y devuelve las columnas de LEAD_SELECT (o lanza el error de Postgres). */
async function insertLead(row: Record<string, unknown>): Promise<Lead | undefined> {
  const cols = LEAD_INSERT_COLUMNS.filter((c) => row[c] !== undefined);
  const values = cols.map((c) => (c === "raw" ? JSON.stringify(row[c]) : row[c]));
  const marks = cols.map((c, i) => `$${i + 1}${c === "raw" ? "::jsonb" : ""}`);
  const { rows } = await query<Lead>(`INSERT INTO leads (${cols.join(", ")}) VALUES (${marks.join(", ")}) RETURNING ${LEAD_SELECT}`, values);
  return rows[0];
}

/** Un duplicado por id externo completa la ubicación del prospecto ya guardado (si aún no la tiene). */
async function enrichExisting(sourceId: string, lead: LeadInput) {
  if (!lead.external_id || (lead.lat == null && !lead.address)) return;
  // Solo se llenan lat/lng si vienen ambos; COALESCE conserva lo que ya hay en las demás columnas
  const hasCoords = lead.lat != null && lead.lng != null;
  await query(
    `UPDATE leads SET lat = COALESCE($1, lat), lng = COALESCE($2, lng), address = COALESCE($3, address)
      WHERE source_id = $4 AND external_id = $5 AND lat IS NULL`,
    [hasCoords ? lead.lat : null, hasCoords ? lead.lng : null, lead.address || null, sourceId, lead.external_id]
  ).catch(() => {}); // el error se ignoraba
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

/**
 * Ejecuta una fuente: colecta, guarda prospectos sin duplicar, registra `job_runs` y avisa por Telegram.
 * Lo usan el worker de Railway ("Ejecutar ahora") y el job programado de GitHub Actions.
 * Si falla, avisa por Telegram y vuelve a lanzar el error.
 */
export async function runSource(sourceId: string) {
  const source = await query<Source>("SELECT * FROM sources WHERE id = $1", [sourceId]).then((r) => r.rows[0], () => undefined);
  if (!source) throw new Error(`Fuente ${sourceId} no encontrada`);
  if (!source.enabled) return;

  const run = await query<{ id: string }>("INSERT INTO job_runs (source_id, queue) VALUES ($1, $2) RETURNING id", [source.id, RUN_QUEUE]).then(
    (r) => r.rows[0],
    () => undefined
  );

  try {
    const { leads: found, nextConfig } = await collect(source);
    const created: Lead[] = [];

    for (const lead of found) {
      const row: Record<string, unknown> = { ...lead, score: lead.score ?? leadScore(lead), source_id: source.id };
      // Las columnas opcionales solo se envían si traen dato (así no fallan si falta la migración correspondiente).
      for (const key of ["external_id", "lat", "lng", "address"]) if (row[key] == null) delete row[key];

      // Se omiten duplicados (índices únicos por email / website / external_id).
      let inserted: Lead | undefined;
      try {
        inserted = await insertLead(row).catch((err: { code?: string; message?: string }) => {
          // Falta la migración 0010 (ubicación): se guarda el prospecto sin esos campos.
          if (err.code === "42703" && /lat|lng|address/.test(err.message ?? "")) {
            delete row.lat;
            delete row.lng;
            delete row.address;
            return insertLead(row);
          }
          throw err;
        });
      } catch (err) {
        if ((err as { code?: string }).code === "23505") {
          await enrichExisting(source.id, lead);
          continue;
        }
        throw err;
      }
      if (inserted) created.push(inserted);
    }

    const config = nextConfig ? JSON.stringify({ ...source.config, ...nextConfig }) : null;
    await query("UPDATE sources SET last_run_at = $1, config = COALESCE($2::jsonb, config) WHERE id = $3", [
      new Date().toISOString(),
      config,
      source.id,
    ]).catch(() => {});

    await query("UPDATE job_runs SET status = 'done', found = $1, inserted = $2, finished_at = $3 WHERE id = $4", [
      found.length,
      created.length,
      new Date().toISOString(),
      run?.id ?? null,
    ]).catch(() => {});

    await announce(source.name, created);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await query("UPDATE job_runs SET status = 'failed', error = $1, finished_at = $2 WHERE id = $3", [message, new Date().toISOString(), run?.id ?? null]).catch(
      () => {}
    );
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
