import { Worker } from "bullmq";
import { COLLECT_QUEUE, connection, type CollectJob } from "./queues.js";
import { runSource } from "./collect.js";

/** Atiende las ejecuciones encoladas desde el dashboard ("Ejecutar ahora"). */
export function startProcessor() {
  const worker = new Worker<CollectJob>(COLLECT_QUEUE, (job) => runSource(job.data.sourceId), {
    connection,
    concurrency: 2,
  });
  worker.on("failed", (job, err) => console.error(`Job ${job?.id} falló:`, err.message));
  return worker;
}
