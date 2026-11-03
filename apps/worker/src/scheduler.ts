import { collectQueue } from "./queues.js";
import { db, type Source } from "./db.js";

/**
 * Atiende el botón "Ejecutar ahora" del dashboard: el dashboard marca `run_requested_at`
 * y aquí se encola la ejecución y se limpia la marca.
 */
export async function pollRunRequests() {
  const { data, error } = await db
    .from("sources")
    .select("id")
    .eq("enabled", true)
    .not("run_requested_at", "is", null);
  if (error) return; // la columna aún no existe si falta la migración 0002

  for (const s of data ?? []) {
    await db.from("sources").update({ run_requested_at: null }).eq("id", s.id);
    await collectQueue.add("collect-now", { sourceId: s.id }, { removeOnComplete: true, removeOnFail: 50 });
    console.log(`Ejecución manual encolada: ${s.id}`);
  }
}

/**
 * Sincroniza las fuentes habilitadas que tienen `cron` con los job schedulers de BullMQ
 * (cron jobs persistidos en Redis). Se vuelve a ejecutar periódicamente para recoger cambios.
 */
export async function syncSchedules() {
  const { data, error } = await db.from("sources").select("*");
  if (error) throw error;
  const sources = (data ?? []) as Source[];

  const wanted = new Set<string>();
  for (const s of sources) {
    if (!s.enabled || !s.cron) continue;
    const id = `source:${s.id}`;
    wanted.add(id);
    await collectQueue.upsertJobScheduler(id, { pattern: s.cron }, { name: "collect", data: { sourceId: s.id } });
  }

  for (const scheduler of await collectQueue.getJobSchedulers()) {
    if (scheduler.key && !wanted.has(scheduler.key)) {
      await collectQueue.removeJobScheduler(scheduler.key);
    }
  }
  console.log(`Schedules sincronizados: ${wanted.size}`);
}
