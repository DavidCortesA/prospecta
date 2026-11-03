import { businessName } from "@/lib/quotes";

// NOTA: la misma lógica vive en apps/worker/src/messages.ts (el bot arma el botón de WhatsApp de Telegram).
// Si cambias una, cambia la otra.

export type TemplateLead = {
  name: string;
  company?: string | null;
  city?: string | null;
  notes?: string | null;
};

export const TEMPLATE_VARIABLES = [
  ["{{empresa}}", "Nombre del negocio"],
  ["{{nombre}}", "Nombre del prospecto"],
  ["{{giro}}", "Giro o actividad"],
  ["{{ciudad}}", "Municipio o ciudad"],
  ["{{negocio}}", "El nombre de tu empresa"],
  ["{{hallazgo}}", "Problema de su sitio web (de la revisión)"],
] as const;

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

export function templateVars(lead: TemplateLead, business = businessName, hallazgo?: string | null): Record<string, string> {
  return {
    nombre: niceName(lead.name),
    empresa: niceName(lead.company || lead.name),
    giro: (lead.notes ?? "").toLowerCase(),
    ciudad: cityName(lead.city) || "su ciudad",
    negocio: business,
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

export const mailtoLink = (email: string, subject: string, body: string) =>
  `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

/** Agrega https:// si falta y limpia lo que suele venir sucio en DENUE ("WWW.SITIO.COM"). La revisión valida la URL en el worker. */
export function normalizeWebsite(raw: string | null | undefined): string | null {
  let v = (raw ?? "").trim();
  if (!v) return null;
  v = v.split(/\s+/)[0];
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    u.hostname = u.hostname.toLowerCase();
    return u.toString();
  } catch {
    return null;
  }
}
