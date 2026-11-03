import { collectQueue } from "./queues.js";
import { db, type Source } from "./db.js";

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
