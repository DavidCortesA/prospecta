import { startProcessor } from "./processor.js";
import { syncSchedules } from "./scheduler.js";
import { notify } from "./telegram.js";

const SYNC_EVERY_MS = 5 * 60 * 1000;

const worker = startProcessor();
await syncSchedules();
const timer = setInterval(() => syncSchedules().catch(console.error), SYNC_EVERY_MS);
await notify("✅ Prospecta worker iniciado");
console.log("Prospecta worker listo");

async function shutdown() {
  clearInterval(timer);
  await worker.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
