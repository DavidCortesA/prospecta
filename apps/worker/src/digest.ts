import { query } from "./db.js";
import { greeting, todayKey } from "./dates.js";
import { countByStatus, dueFollowups, sendLeadCard } from "./leads.js";
import { notify } from "./telegram.js";

const MAX_CARDS = 5;

/**
 * Resumen del día por Telegram: seguimientos de hoy/vencidos (con botones), prospectos sin contactar
 * y cotizaciones esperando respuesta. Si no hay nada pendiente no manda mensaje, salvo `force` (comando /hoy).
 */
export async function sendDigest(force = false): Promise<void> {
  const [due, fresh, quotesWaiting] = await Promise.all([
    dueFollowups(50),
    countByStatus("new"),
    // La tabla de cotizaciones puede no existir si falta la migración 0004
    query<{ n: number }>("SELECT count(*)::int AS n FROM quotes WHERE status = 'sent'").then((r) => r.rows[0].n, () => 0),
  ]);

  if (!force && !due.length && !fresh && !quotesWaiting) return;

  const overdue = due.filter((l) => l.next_followup! < todayKey()).length;
  const lines = [`☀️ <b>${greeting()}</b> — esto es lo de hoy`, ""];
  lines.push(
    due.length
      ? `📅 <b>${due.length}</b> ${due.length === 1 ? "seguimiento" : "seguimientos"}${overdue ? ` (${overdue} vencidos)` : ""}`
      : "📅 Sin seguimientos pendientes"
  );
  lines.push(`🆕 <b>${fresh}</b> sin contactar${fresh ? " · /pendientes" : ""}`);
  if (quotesWaiting) lines.push(`🧾 <b>${quotesWaiting}</b> ${quotesWaiting === 1 ? "cotización espera" : "cotizaciones esperan"} respuesta`);
  await notify(lines.join("\n"));

  for (const lead of due.slice(0, MAX_CARDS)) await sendLeadCard(lead, "Seguimiento");
  if (due.length > MAX_CARDS) await notify(`➕ ${due.length - MAX_CARDS} seguimientos más. Escribe /seguimientos o míralos en el dashboard.`);
}
