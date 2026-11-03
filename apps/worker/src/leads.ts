import { config } from "./config.js";
import { db } from "./db.js";
import { addDays, dayLabel, todayKey } from "./dates.js";
import { whatsappUrlFor } from "./messages.js";
import { connection } from "./queues.js";
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

export function leadKeyboard(lead: Pick<Lead, "id" | "lat" | "lng" | "website">, waUrl?: string | null): Keyboard {
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

const MESSAGE_TTL = 60 * 60 * 24 * 30;

/** Envía la ficha con botones y recuerda qué prospecto es, para poder responderle con palabras clave. */
export const statusLine = (status: LeadStatus) => `Estado: ${STATUS_EMOJI[status]} ${STATUS_LABEL[status]}`;
export const followupLine = (date: string | null) => (date ? `📅 Seguimiento: ${dayLabel(date)}` : null);

export async function sendLeadCard(lead: Lead, title: string, extra = ""): Promise<void> {
  const text = [`${leadCard(lead, title)}${extra}`, statusLine(lead.status), followupLine(lead.next_followup)].filter(Boolean).join("\n");
  const messageId = await notify(text, leadKeyboard(lead, await whatsappUrlFor(lead)));
  if (messageId) await connection.set(`tg:msg:${messageId}`, lead.id, "EX", MESSAGE_TTL);
}

export async function leadForMessage(messageId: number): Promise<string | null> {
  return connection.get(`tg:msg:${messageId}`);
}

export async function getLead(id: string): Promise<Lead | null> {
  const { data } = await db.from("leads").select(LEAD_COLUMNS).eq("id", id).maybeSingle();
  return (data as Lead | null) ?? null;
}

export async function findLeads(query: string, limit = 5): Promise<Lead[]> {
  const term = query.replace(/[%,()]/g, " ").trim();
  if (!term) return [];
  const { data } = await db
    .from("leads")
    .select(LEAD_COLUMNS)
    .or(`name.ilike.%${term}%,company.ilike.%${term}%`)
    .order("score", { ascending: false })
    .limit(limit);
  return (data as Lead[] | null) ?? [];
}

export async function pendingLeads(limit = 5): Promise<Lead[]> {
  const { data } = await db.from("leads").select(LEAD_COLUMNS).eq("status", "new").order("score", { ascending: false }).limit(limit);
  return (data as Lead[] | null) ?? [];
}

export async function statusCounts(): Promise<Record<string, number>> {
  const { data } = await db.from("leads").select("status").limit(5000);
  const counts: Record<string, number> = {};
  for (const l of data ?? []) counts[l.status] = (counts[l.status] ?? 0) + 1;
  return counts;
}

/** Cambia el estado igual que el dashboard: ganar crea cliente y proyecto; perder guarda el motivo. */
export async function changeStatus(id: string, status: LeadStatus, extra?: { dealValue?: number | null; reason?: string | null }): Promise<Lead | null> {
  const patch: Record<string, unknown> = { status, lost_reason: status === "lost" ? (extra?.reason ?? null) : null };
  if (status === "won" && extra?.dealValue != null) patch.deal_value = extra.dealValue;

  const { error } = await db.from("leads").update(patch).eq("id", id);
  if (error) {
    console.error("changeStatus:", error.message);
    return null;
  }
  if (status === "won") await ensureClientFromLead(id);
  return getLead(id);
}

export async function addNote(id: string, text: string): Promise<boolean> {
  const { error } = await db.from("lead_events").insert({ lead_id: id, type: "note", payload: { text, via: "telegram" } });
  return !error;
}

const DEFAULT_MILESTONES = ["Kickoff y requerimientos", "Diseño aprobado", "Desarrollo", "Pruebas y ajustes", "Entrega y capacitación"];

/** Misma lógica que el dashboard (apps/web/lib/clients.ts). Si la migración 0003 no está aplicada, no hace nada. */
async function ensureClientFromLead(leadId: string): Promise<void> {
  const { data: existing, error: findError } = await db.from("clients").select("id").eq("lead_id", leadId).maybeSingle();
  if (findError || existing) return;

  const { data: lead } = await db.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!lead) return;

  const { data: client, error } = await db
    .from("clients")
    .insert({ lead_id: lead.id, name: lead.name, company: lead.company, email: lead.email, phone: lead.phone, website: lead.website, notes: lead.notes })
    .select("id")
    .single();
  if (error || !client) return;

  const { data: project } = await db
    .from("projects")
    .insert({ client_id: client.id, name: `Proyecto ${lead.company ?? lead.name}`, budget: lead.deal_value, currency: "USD" })
    .select("id")
    .single();
  if (project) {
    await db.from("project_milestones").insert(DEFAULT_MILESTONES.map((title, position) => ({ project_id: project.id, title, position })));
  }
}

/** Agenda el seguimiento dentro de N días (o lo quita con null). Devuelve la fecha fijada. */
export async function setFollowupIn(id: string, days: number | null): Promise<string | null | undefined> {
  const date = days === null ? null : addDays(todayKey(), days);
  const { error } = await db.from("leads").update({ next_followup: date }).eq("id", id);
  if (error) {
    console.error("setFollowupIn:", error.message);
    return undefined;
  }
  return date;
}

/** Prospectos abiertos con seguimiento de hoy o vencido, del más atrasado al más reciente. */
export async function dueFollowups(limit = 50): Promise<Lead[]> {
  const { data } = await db
    .from("leads")
    .select(LEAD_COLUMNS)
    .lte("next_followup", todayKey())
    .not("status", "in", "(won,lost)")
    .order("next_followup", { ascending: true })
    .limit(limit);
  return (data as Lead[] | null) ?? [];
}

export async function countByStatus(status: LeadStatus): Promise<number> {
  const { count } = await db.from("leads").select("*", { count: "exact", head: true }).eq("status", status);
  return count ?? 0;
}
