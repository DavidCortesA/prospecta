// Job programado para GitHub Actions (.github/workflows/scheduled-jobs.yml): corre cada 15 minutos,
// ejecuta las fuentes cuyo cron ya venció y manda el resumen diario si toca. No necesita Redis.
import { CronExpressionParser } from "cron-parser";
import { config } from "../config.js";
import { pool, query, type Source } from "../db.js";
import { runSource } from "../collect.js";
import { sendDigest } from "../digest.js";

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

const now = new Date();
await runDueSources(now);
await runDigest(now).catch((err) => {
  console.error("Resumen diario falló:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
await pool.end();
console.log("Trabajos programados listos");
