import { startProcessor } from "./processor.js";
import { pollRunRequests, removeSchedules } from "./scheduler.js";
import { startTelegramBot } from "./bot.js";
import { pollQuoteEvents } from "./quotes.js";
import { pollSiteAudits } from "./audit/runner.js";
import { notify } from "./telegram.js";

const POLL_EVERY_MS = 20 * 1000;

const worker = startProcessor();
// Los cron ya corren en GitHub Actions (src/jobs/scheduled.ts): aquí solo se limpian los que quedaron en Redis
await removeSchedules();
const pollTimer = setInterval(() => {
  pollRunRequests().catch(console.error);
  pollQuoteEvents().catch(console.error);
  pollSiteAudits().catch(console.error);
}, POLL_EVERY_MS);
const stopBot = startTelegramBot();
await notify("✅ Prospecta worker iniciado. Escribe /ayuda para ver cómo marcar prospectos desde aquí.");
console.log("Prospecta worker listo");

async function shutdown() {
  clearInterval(pollTimer);
  stopBot();
  await worker.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
