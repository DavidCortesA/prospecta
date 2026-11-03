import { startProcessor } from "./processor.js";
import { pollRunRequests, syncSchedules } from "./scheduler.js";
import { notify } from "./telegram.js";

const SYNC_EVERY_MS = 5 * 60 * 1000;
const POLL_EVERY_MS = 20 * 1000;

const worker = startProcessor();
await syncSchedules();
const syncTimer = setInterval(() => syncSchedules().catch(console.error), SYNC_EVERY_MS);
const pollTimer = setInterval(() => pollRunRequests().catch(console.error), POLL_EVERY_MS);
await notify("✅ Prospecta worker iniciado");
console.log("Prospecta worker listo");

async function shutdown() {
  clearInterval(syncTimer);
  clearInterval(pollTimer);
  await worker.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
