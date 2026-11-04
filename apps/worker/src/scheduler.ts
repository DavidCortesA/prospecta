import { Queue } from "bullmq";
import { collectQueue, connection } from "./queues.js";
import { query } from "./db.js";

/** Cola donde Railway guardaba el resumen diario antes de la migración a GitHub Actions. */
const LEGACY_DIGEST_QUEUE = "digest";

/**
 * Atiende el botón "Ejecutar ahora" del dashboard: el dashboard marca `run_requested_at`
 * y aquí se encola la ejecución y se limpia la marca.
 */
export async function pollRunRequests() {
  let data: { id: string }[];
  try {
    ({ rows: data } = await query<{ id: string }>("SELECT id FROM sources WHERE enabled = true AND run_requested_at IS NOT NULL"));
  } catch {
    return; // la columna aún no existe si falta la migración 0002
  }

  for (const s of data) {
    // Si no se puede limpiar la marca, igual se encola (como antes: el error se ignoraba)
    await query("UPDATE sources SET run_requested_at = NULL WHERE id = $1", [s.id]).catch(() => {});
    await collectQueue.add("collect-now", { sourceId: s.id }, { removeOnComplete: true, removeOnFail: 50 });
    console.log(`Ejecución manual encolada: ${s.id}`);
  }
}

/**
 * Los cron de fuentes y el resumen diario ahora los ejecuta GitHub Actions (src/jobs/scheduled.ts).
 * Quita los job schedulers que quedaron en Redis; si no, Railway seguiría ejecutándolos en paralelo.
 */
export async function removeSchedules() {
  for (const scheduler of await collectQueue.getJobSchedulers()) {
    if (scheduler.key) await collectQueue.removeJobScheduler(scheduler.key);
  }

  const digestQueue = new Queue(LEGACY_DIGEST_QUEUE, { connection });
  for (const scheduler of await digestQueue.getJobSchedulers()) {
    if (scheduler.key) await digestQueue.removeJobScheduler(scheduler.key);
  }
  await digestQueue.close();
}
