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
// El bot normalmente corre en el Worker de Cloudflare por webhook (apps/bot). El polling es opcional
// (desarrollo local o sin Cloudflare): getUpdates quita el webhook, así que NO lo actives con el Worker en uso.
const stopBot = process.env.TELEGRAM_POLLING === "1" ? startTelegramBot() : () => {};
await notify("✅ Prospecta worker iniciado.");
console.log("Prospecta worker listo");

async function shutdown() {
  clearInterval(pollTimer);
  stopBot();
  await worker.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
