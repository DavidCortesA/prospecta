import { config } from "./config.js";
import { query } from "./db.js";

// NOTA: la misma lógica vive en apps/web/lib/templates.ts (el dashboard arma los botones del detalle del
// prospecto). Si cambias una, cambia la otra.

export type TemplateLead = {
  name: string;
  company?: string | null;
  city?: string | null;
  notes?: string | null;
};

/** "DENT CARE DENTISTA" -> "Dent Care Dentista"; si ya trae minúsculas se respeta. */
export function niceName(s: string | null | undefined): string {
  const v = (s ?? "").trim();
  if (!v) return "";
  if (v !== v.toUpperCase()) return v;
  return v.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** "MONTERREY,Monterrey,NUEVO LEÓN" -> "Monterrey" */
export function cityName(city: string | null | undefined): string {
  const parts = (city ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  return niceName(parts[1] ?? parts[0] ?? "");
}

export function templateVars(lead: TemplateLead, hallazgo?: string | null): Record<string, string> {
  return {
    nombre: niceName(lead.name),
    empresa: niceName(lead.company || lead.name),
    giro: (lead.notes ?? "").toLowerCase(),
    ciudad: cityName(lead.city) || "su ciudad",
    negocio: config.businessName,
    hallazgo: hallazgo || "su sitio web tiene oportunidades de mejora",
  };
}

export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => (key in vars ? vars[key] : match));
}

/** Teléfono mexicano -> formato internacional sin "+" para wa.me, o null si no parece válido. */
export function whatsappNumber(phone: string | null | undefined): string | null {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("044") || d.startsWith("045")) d = d.slice(3);
  if (d.startsWith("01") && d.length === 12) d = d.slice(2);
  if (d.length === 10) return `52${d}`;
  if (d.length === 12 && d.startsWith("52")) return d;
  if (d.length === 13 && d.startsWith("521")) return `52${d.slice(3)}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

export const whatsappLink = (phone: string | null | undefined, text: string): string | null => {
  const n = whatsappNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
};

// Plantilla de WhatsApp por defecto, con caché corta para no consultar la base en cada aviso.
let cached: { at: number; body: string | null } | null = null;

async function defaultWhatsappBody(): Promise<string | null> {
  if (cached && Date.now() - cached.at < 60_000) return cached.body;
  // Si la migración 0008 no está aplicada, no hay botón de WhatsApp (el resto del bot sigue igual)
  const body = await query<{ body: string }>(
    "SELECT body FROM message_templates WHERE channel = 'whatsapp' AND active = true ORDER BY is_default DESC, created_at ASC LIMIT 1"
  ).then((r) => r.rows[0]?.body ?? null, () => null);
  cached = { at: Date.now(), body };
  return body;
}

/** Frase de la última auditoría terminada del prospecto (para la variable {{hallazgo}}). */
async function latestHeadline(leadId: string): Promise<string | null> {
  return query<{ headline: string | null }>(
    "SELECT headline FROM site_audits WHERE lead_id = $1 AND status = 'done' ORDER BY created_at DESC LIMIT 1",
    [leadId]
  ).then((r) => r.rows[0]?.headline ?? null, () => null);
}

/** Enlace de WhatsApp con la plantilla por defecto ya llena para este prospecto (o null si no aplica). */
export async function whatsappUrlFor(lead: TemplateLead & { id: string; phone: string | null }): Promise<string | null> {
  if (!lead.phone) return null;
  const body = await defaultWhatsappBody();
  if (!body) return null;
  const needsAudit = body.includes("{{hallazgo}}");
  return whatsappLink(lead.phone, renderTemplate(body, templateVars(lead, needsAudit ? await latestHeadline(lead.id) : null)));
}

// ---------------------------------------------------------------------------------------------
// Propuesta por correo
// ---------------------------------------------------------------------------------------------

type EmailTemplate = { name: string; subject: string | null; body: string };

let emailCached: { at: number; tpl: EmailTemplate | null } | null = null;

/** Plantilla de correo marcada por defecto (o la primera activa), con caché corta. */
async function defaultEmailTemplate(): Promise<EmailTemplate | null> {
  if (emailCached && Date.now() - emailCached.at < 60_000) return emailCached.tpl;
  const tpl = await query<EmailTemplate>(
    "SELECT name, subject, body FROM message_templates WHERE channel = 'email' AND active = true ORDER BY is_default DESC, created_at ASC LIMIT 1"
  ).then((r) => r.rows[0] ?? null, () => null);
  emailCached = { at: Date.now(), tpl };
  return tpl;
}

export type EmailDraft = {
  to: string;
  subject: string;
  body: string;
  templateName: string;
  /** Enlaces web para redactar el correo (Telegram no admite botones `mailto:`) */
  gmailUrl: string;
  outlookUrl: string;
};

const queryString = (params: Record<string, string>) =>
  Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

// Telegram rechaza botones con URL demasiado larga: si el cuerpo no cabe, el enlace lleva solo destinatario y asunto.
const MAX_BUTTON_URL = 1800;

export function composeUrls(to: string, subject: string, body: string): { gmailUrl: string; outlookUrl: string } {
  const make = (withBody: boolean) => ({
    gmailUrl: `https://mail.google.com/mail/?view=cm&fs=1&${queryString({ to, su: subject, ...(withBody ? { body } : {}) })}`,
    outlookUrl: `https://outlook.office.com/mail/deeplink/compose?${queryString({ to, subject, ...(withBody ? { body } : {}) })}`,
  });
  const full = make(true);
  return full.gmailUrl.length <= MAX_BUTTON_URL && full.outlookUrl.length <= MAX_BUTTON_URL ? full : make(false);
}

/** Arma el correo a partir de una plantilla ya cargada (función pura, fácil de probar). */
export function buildEmailDraft(tpl: EmailTemplate, lead: TemplateLead & { email: string }, hallazgo?: string | null): EmailDraft {
  const vars = templateVars(lead, hallazgo);
  const subject = renderTemplate(tpl.subject ?? "", vars).trim();
  const body = renderTemplate(tpl.body, vars).trim();
  return { to: lead.email, subject, body, templateName: tpl.name, ...composeUrls(lead.email, subject, body) };
}

/** Correo listo para este prospecto con la plantilla de correo por defecto (o null si no tiene correo o no hay plantilla). */
export async function emailDraftFor(lead: TemplateLead & { id: string; email: string | null }): Promise<EmailDraft | null> {
  if (!lead.email) return null;
  const tpl = await defaultEmailTemplate();
  if (!tpl) return null;
  const needsAudit = `${tpl.subject ?? ""}${tpl.body}`.includes("{{hallazgo}}");
  return buildEmailDraft(tpl, { ...lead, email: lead.email }, needsAudit ? await latestHeadline(lead.id) : null);
}
