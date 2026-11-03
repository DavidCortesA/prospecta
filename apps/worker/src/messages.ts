import { config } from "./config.js";
import { db } from "./db.js";

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

export function templateVars(lead: TemplateLead): Record<string, string> {
  return {
    nombre: niceName(lead.name),
    empresa: niceName(lead.company || lead.name),
    giro: (lead.notes ?? "").toLowerCase(),
    ciudad: cityName(lead.city) || "su ciudad",
    negocio: config.businessName,
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
  const { data, error } = await db
    .from("message_templates")
    .select("body")
    .eq("channel", "whatsapp")
    .eq("active", true)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  // Si la migración 0008 no está aplicada, no hay botón de WhatsApp (el resto del bot sigue igual)
  const body = error ? null : ((data?.body as string | undefined) ?? null);
  cached = { at: Date.now(), body };
  return body;
}

/** Enlace de WhatsApp con la plantilla por defecto ya llena para este prospecto (o null si no aplica). */
export async function whatsappUrlFor(lead: TemplateLead & { phone: string | null }): Promise<string | null> {
  if (!lead.phone) return null;
  const body = await defaultWhatsappBody();
  if (!body) return null;
  return whatsappLink(lead.phone, renderTemplate(body, templateVars(lead)));
}
