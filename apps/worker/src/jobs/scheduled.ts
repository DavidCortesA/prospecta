// Job programado para GitHub Actions (.github/workflows/scheduled-jobs.yml): corre cada 15 minutos,
// ejecuta las fuentes cuyo cron ya venció, manda el resumen diario si toca y atiende lo que antes hacía
// Railway ("Ejecutar ahora", auditorías de sitios y avisos de cotizaciones). No necesita Redis.
// Todo es idempotente: si Railway sigue activo atiende esas cosas cada 20 s y aquí no queda nada pendiente.
import { CronExpressionParser } from "cron-parser";
import { config } from "../config.js";
import { pool, query, type Source } from "../db.js";
import { runSource } from "../collect.js";
import { sendDigest } from "../digest.js";
import { pollQuoteEvents } from "../quotes.js";
import { pollSiteAudits } from "../audit/runner.js";
import { notify, escapeHtml } from "../telegram.js";
import { kapsoSender, runOutreach, type OutreachDeps } from "../whatsapp/outreach.js";

/** Última hora programada (anterior a `now`) de una expresión cron. */
function lastTick(expression: string, tz: string, now: Date): Date {
  return CronExpressionParser.parse(expression, { currentDate: now, tz }).prev().toDate();
}

/**
 * Una fuente corre si no tiene ninguna ejecución iniciada desde su última hora programada.
 * Así cada cron se intenta una vez por tick, aunque GitHub Actions llegue tarde.
 */
async function runDueSources(now: Date) {
  const { rows: sources } = await query<Source & { last_started: Date | null }>(
    `SELECT s.*, (SELECT max(r.started_at) FROM job_runs r WHERE r.source_id = s.id) AS last_started
       FROM sources s
      WHERE s.enabled = true AND s.cron IS NOT NULL`
  );

  for (const source of sources) {
    try {
      // Los cron de las fuentes se interpretan en UTC (como los job schedulers de BullMQ en Railway)
      const tick = lastTick(source.cron!, "UTC", now);
      if (source.last_started && new Date(source.last_started) >= tick) continue;

      console.log(`Ejecutando fuente programada: ${source.name}`);
      await runSource(source.id);
    } catch (err) {
      // runSource ya avisó por Telegram; se sigue con las demás fuentes
      console.error(`Fuente ${source.name} falló:`, err instanceof Error ? err.message : err);
      process.exitCode = 1;
    }
  }
}

/** Botón "Ejecutar ahora" del dashboard: el dashboard marca `run_requested_at` y aquí se ejecuta la fuente. */
async function runRequestedSources() {
  let requested: { id: string }[];
  try {
    ({ rows: requested } = await query<{ id: string }>(
      "SELECT id FROM sources WHERE enabled = true AND run_requested_at IS NOT NULL"
    ));
  } catch {
    return; // la columna aún no existe si falta la migración 0002
  }

  for (const { id } of requested) {
    // Se reclama con un update condicional para no ejecutarla dos veces (p. ej. si Railway también está activo)
    const claimed = await query("UPDATE sources SET run_requested_at = NULL WHERE id = $1 AND run_requested_at IS NOT NULL RETURNING id", [id]);
    if (!claimed.rows.length) continue;
    try {
      console.log(`Ejecución manual: ${id}`);
      await runSource(id);
    } catch (err) {
      console.error(`Ejecución manual ${id} falló:`, err instanceof Error ? err.message : err);
      process.exitCode = 1;
    }
  }
}

/** Revisiones de sitio web pedidas desde Telegram o el dashboard (Chromium ya está instalado en el workflow). */
async function drainSiteAudits(max = 5) {
  for (let i = 0; i < max; i++) {
    const pending = await query("SELECT 1 FROM site_audits WHERE status = 'pending' LIMIT 1").then((r) => r.rows.length, () => 0);
    if (!pending) return;
    await pollSiteAudits(); // atiende una por llamada
  }
}

/** Resumen diario: una vez por tick de `DIGEST_CRON` en la zona horaria de la app. */
async function runDigest(now: Date) {
  const tick = lastTick(config.digestCron, config.timezone, now);
  const { rows } = await query<{ started_at: Date }>(
    `SELECT started_at FROM job_runs WHERE queue = 'digest' ORDER BY started_at DESC LIMIT 1`
  );
  if (rows[0] && new Date(rows[0].started_at) >= tick) return;

  // Se registra antes de enviar: si el envío falla, no se reintenta cada 15 minutos
  await query(`INSERT INTO job_runs (queue, status) VALUES ('digest', 'done')`);
  await sendDigest();
}

/** Primer mensaje de WhatsApp a prospectos nuevos (apagado salvo WHATSAPP_OUTREACH=on). */
async function runWhatsappOutreach(now: Date) {
  const w = config.whatsapp;
  if (!w.enabled) return;
  if (!w.apiKey || !w.phoneNumberId || !w.templateName) {
    throw new Error("WhatsApp activado pero faltan KAPSO_API_KEY, KAPSO_PHONE_NUMBER_ID o WHATSAPP_TEMPLATE_NAME");
  }
  const result = await runOutreach(
    {
      query: ((text: string, values?: unknown[]) => query(text, values)) as OutreachDeps["query"],
      send: kapsoSender(w.apiKey, w.phoneNumberId, w.templateName, w.templateLang),
      notify: (text) => notify(text),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      escape: escapeHtml,
    },
    { ...w, timezone: config.timezone },
    now
  );
  console.log(`WhatsApp: ${result.sent} enviados, ${result.failed} fallidos${result.skipped ? ` (${result.skipped})` : ""}`);
}

const now = new Date();
await runRequestedSources();
await runDueSources(now);
await runDigest(now).catch((err) => {
  console.error("Resumen diario falló:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
await pollQuoteEvents().catch((err) => {
  console.error("Avisos de cotizaciones fallaron:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
await drainSiteAudits().catch((err) => {
  console.error("Auditorías de sitios fallaron:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
await runWhatsappOutreach(now).catch((err) => {
  console.error("Envío de WhatsApp falló:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
await pool.end();
console.log("Trabajos programados listos");
