import { config } from "./config.js";
import { query } from "./db.js";
import { addDays, dayLabel, todayKey } from "./dates.js";
import { whatsappUrlFor } from "./messages.js";
import { escapeHtml, notify, type Keyboard } from "./telegram.js";

export type LeadStatus = "new" | "contacted" | "replied" | "qualified" | "won" | "lost";

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  replied: "Respondió",
  qualified: "Calificado",
  won: "Ganado",
  lost: "Perdido",
};

export const STATUS_EMOJI: Record<LeadStatus, string> = {
  new: "🆕",
  contacted: "✅",
  replied: "💬",
  qualified: "⭐",
  won: "🏆",
  lost: "❌",
};

/** Códigos cortos para callback_data (Telegram limita a 64 bytes). */
export const CODE_TO_STATUS: Record<string, LeadStatus> = {
  n: "new",
  c: "contacted",
  r: "replied",
  q: "qualified",
  w: "won",
  l: "lost",
};
const STATUS_TO_CODE = Object.fromEntries(Object.entries(CODE_TO_STATUS).map(([c, s]) => [s, c])) as Record<LeadStatus, string>;

export type Lead = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  notes: string | null;
  status: LeadStatus;
  website: string | null;
  next_followup: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
};

const LEAD_COLUMNS = "id, name, company, email, phone, city, notes, status, website, next_followup, lat, lng, address";

export function leadKeyboard(lead: Pick<Lead, "id" | "lat" | "lng" | "website" | "email">, waUrl?: string | null): Keyboard {
  const b = (status: LeadStatus) => ({ text: `${STATUS_EMOJI[status]} ${STATUS_LABEL[status]}`, callback_data: `s:${lead.id}:${STATUS_TO_CODE[status]}` });
  const rows: Keyboard = [
    [b("contacted"), b("replied")],
    [b("qualified"), b("won")],
    [{ ...b("lost"), text: "❌ Rechazó" }, { text: "⏰ +3 días", callback_data: `f:${lead.id}:3` }],
  ];
  if (lead.lat != null && lead.lng != null) {
    rows.push([{ text: "📍 Cómo llegar", url: `https://www.google.com/maps/search/?api=1&query=${lead.lat},${lead.lng}` }]);
  }
  if (lead.website) rows.push([{ text: "🔎 Revisar su sitio web", callback_data: `a:${lead.id}` }]);
  if (lead.email) rows.push([{ text: "✉️ Propuesta por correo", callback_data: `m:${lead.id}` }]);
  if (waUrl) rows.push([{ text: "📲 Abrir WhatsApp con mensaje", url: waUrl }]);
  if (config.dashboardUrl) rows.push([{ text: "Abrir en el dashboard", url: `${config.dashboardUrl}/prospectos/${lead.id}` }]);
  return rows;
}

export function leadCard(lead: Lead, title = "Prospecto"): string {
  return (
    `<b>${escapeHtml(title)}</b>\n${escapeHtml(lead.name)}` +
    (lead.company && lead.company !== lead.name ? ` — ${escapeHtml(lead.company)}` : "") +
    (lead.notes ? `\n🏷️ ${escapeHtml(lead.notes.slice(0, 80))}` : "") +
    (lead.address ? `\n🏠 ${escapeHtml(lead.address)}` : lead.city ? `\n📍 ${escapeHtml(lead.city)}` : "") +
    (lead.phone ? `\n📞 ${escapeHtml(lead.phone)}` : "") +
    (lead.email ? `\n✉️ ${escapeHtml(lead.email)}` : "")
  );
}

/** Las respuestas a fichas de hace más de 30 días ya no se asocian a su prospecto. */
const MESSAGE_TTL_DAYS = 30;

/** Envía la ficha con botones y recuerda qué prospecto es, para poder responderle con palabras clave. */
export const statusLine = (status: LeadStatus) => `Estado: ${STATUS_EMOJI[status]} ${STATUS_LABEL[status]}`;
export const followupLine = (date: string | null) => (date ? `📅 Seguimiento: ${dayLabel(date)}` : null);

export async function sendLeadCard(lead: Lead, title: string, extra = ""): Promise<void> {
  const text = [`${leadCard(lead, title)}${extra}`, statusLine(lead.status), followupLine(lead.next_followup)].filter(Boolean).join("\n");
  const messageId = await notify(text, leadKeyboard(lead, await whatsappUrlFor(lead)));
  if (messageId) {
    await query(
      `INSERT INTO telegram_messages (message_id, lead_id) VALUES ($1, $2)
       ON CONFLICT (message_id) DO UPDATE SET lead_id = EXCLUDED.lead_id, created_at = now()`,
      [messageId, lead.id]
    );
  }
}

export async function leadForMessage(messageId: number): Promise<string | null> {
  const { rows } = await query<{ lead_id: string }>(
    `SELECT lead_id FROM telegram_messages WHERE message_id = $1 AND created_at > now() - make_interval(days => $2)`,
    [messageId, MESSAGE_TTL_DAYS]
  );
  return rows[0]?.lead_id ?? null;
}

export async function getLead(id: string): Promise<Lead | null> {
  return query<Lead>(`SELECT ${LEAD_COLUMNS} FROM leads WHERE id = $1`, [id]).then((r) => r.rows[0] ?? null, () => null);
}

export async function findLeads(search: string, limit = 5): Promise<Lead[]> {
  const term = search.replace(/[%,()]/g, " ").trim();
  if (!term) return [];
  return query<Lead>(
    `SELECT ${LEAD_COLUMNS} FROM leads WHERE name ILIKE $1 OR company ILIKE $1 ORDER BY score DESC LIMIT $2`,
    [`%${term}%`, limit]
  ).then((r) => r.rows, () => []);
}

export async function pendingLeads(limit = 5): Promise<Lead[]> {
  return query<Lead>(`SELECT ${LEAD_COLUMNS} FROM leads WHERE status = 'new' ORDER BY score DESC LIMIT $1`, [limit]).then(
    (r) => r.rows,
    () => []
  );
}

export async function statusCounts(): Promise<Record<string, number>> {
  const data = await query<{ status: string }>("SELECT status FROM leads LIMIT 5000").then((r) => r.rows, () => []);
  const counts: Record<string, number> = {};
  for (const l of data) counts[l.status] = (counts[l.status] ?? 0) + 1;
  return counts;
}

/** Cambia el estado igual que el dashboard: ganar crea cliente y proyecto; perder guarda el motivo. */
export async function changeStatus(id: string, status: LeadStatus, extra?: { dealValue?: number | null; reason?: string | null }): Promise<Lead | null> {
  // deal_value solo se cambia al ganar con monto (COALESCE conserva el valor actual en los demás casos)
  const dealValue = status === "won" ? (extra?.dealValue ?? null) : null;
  try {
    await query("UPDATE leads SET status = $1, lost_reason = $2, deal_value = COALESCE($3, deal_value) WHERE id = $4", [
      status,
      status === "lost" ? (extra?.reason ?? null) : null,
      dealValue,
      id,
    ]);
  } catch (err) {
    console.error("changeStatus:", (err as Error).message);
    return null;
  }
  if (status === "won") await ensureClientFromLead(id);
  return getLead(id);
}

export async function addNote(id: string, text: string): Promise<boolean> {
  return query("INSERT INTO lead_events (lead_id, type, payload) VALUES ($1, 'note', $2::jsonb)", [id, JSON.stringify({ text, via: "telegram" })]).then(
    () => true,
    () => false
  );
}

const DEFAULT_MILESTONES = ["Kickoff y requerimientos", "Diseño aprobado", "Desarrollo", "Pruebas y ajustes", "Entrega y capacitación"];

/** Misma lógica que el dashboard (apps/web/lib/clients.ts). Si la migración 0003 no está aplicada, no hace nada. */
async function ensureClientFromLead(leadId: string): Promise<void> {
  // Cualquier error aquí termina la función sin hacer nada más (igual que antes con `error`/`data` ignorados)
  try {
    const existing = await query("SELECT id FROM clients WHERE lead_id = $1", [leadId]);
    if (existing.rows.length) return;

    const lead = (await query<Lead & { deal_value: string | null }>("SELECT * FROM leads WHERE id = $1", [leadId])).rows[0];
    if (!lead) return;

    const client = (
      await query<{ id: string }>(
        "INSERT INTO clients (lead_id, name, company, email, phone, website, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
        [lead.id, lead.name, lead.company, lead.email, lead.phone, lead.website, lead.notes]
      )
    ).rows[0];
    if (!client) return;

    const project = (
      await query<{ id: string }>("INSERT INTO projects (client_id, name, budget, currency) VALUES ($1, $2, $3, 'MXN') RETURNING id", [
        client.id,
        `Proyecto ${lead.company ?? lead.name}`,
        lead.deal_value,
      ])
    ).rows[0];
    if (project) {
      const values = DEFAULT_MILESTONES.flatMap((title, position) => [project.id, title, position]);
      const placeholders = DEFAULT_MILESTONES.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(", ");
      await query(`INSERT INTO project_milestones (project_id, title, position) VALUES ${placeholders}`, values);
    }
  } catch {
    // Sin efecto: el estado del prospecto ya quedó cambiado
  }
}

/** Agenda el seguimiento dentro de N días (o lo quita con null). Devuelve la fecha fijada. */
export async function setFollowupIn(id: string, days: number | null): Promise<string | null | undefined> {
  const date = days === null ? null : addDays(todayKey(), days);
  try {
    await query("UPDATE leads SET next_followup = $1 WHERE id = $2", [date, id]);
  } catch (err) {
    console.error("setFollowupIn:", (err as Error).message);
    return undefined;
  }
  return date;
}

/** Prospectos abiertos con seguimiento de hoy o vencido, del más atrasado al más reciente. */
export async function dueFollowups(limit = 50): Promise<Lead[]> {
  return query<Lead>(
    `SELECT ${LEAD_COLUMNS} FROM leads WHERE next_followup <= $1 AND status NOT IN ('won', 'lost') ORDER BY next_followup ASC LIMIT $2`,
    [todayKey(), limit]
  ).then((r) => r.rows, () => []);
}

export async function countByStatus(status: LeadStatus): Promise<number> {
  return query<{ n: number }>("SELECT count(*)::int AS n FROM leads WHERE status = $1", [status]).then((r) => r.rows[0].n, () => 0);
}
