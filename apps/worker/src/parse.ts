import type { LeadStatus } from "./leads.js";

export type Parsed =
  | { kind: "command"; name: string; rest: string }
  | { kind: "status"; status: LeadStatus; rest: string }
  | { kind: "note"; rest: string }
  | { kind: "followup"; days: number; rest: string }
  | { kind: "audit"; rest: string }
  | { kind: "proposal"; rest: string };

/** Palabras clave (sin acentos, en minúsculas) -> estado. */
const KEYWORDS: Record<string, LeadStatus> = {
  nuevo: "new",
  contactado: "contacted",
  contacte: "contacted",
  llame: "contacted",
  escribi: "contacted",
  respondio: "replied",
  contesto: "replied",
  calificado: "qualified",
  interesado: "qualified",
  ganado: "won",
  cerrado: "won",
  cliente: "won",
  concretado: "won",
  rechazo: "lost",
  rechazado: "lost",
  perdido: "lost",
  nointeresa: "lost",
};

const PROPOSAL_WORDS = new Set(["correo", "email", "mail", "propuesta"]);
const AUDIT_WORDS = new Set(["sitio", "auditar", "revisar"]);
const FOLLOWUP_WORDS = new Set(["recordar", "recuerdame", "seguimiento", "agendar", "posponer"]);
const DAY_WORDS: Record<string, number> = { hoy: 0, manana: 1, semana: 7, quincena: 15, mes: 30 };
const FILLER = new Set(["dias", "dia", "en", "a", "de", "para", "el", "la"]);

/** "recordar 3 dias Pérez" -> { days: 3, rest: "Pérez" }; sin número se asume 3 días. */
export function parseFollowup(rest: string): { days: number; rest: string } {
  const tokens = rest.split(/\s+/).filter(Boolean);
  let days: number | null = null;
  const kept: string[] = [];
  for (const t of tokens) {
    const n = normalize(t).replace(/[^a-z0-9]/g, "");
    if (days === null && /^\d+$/.test(n)) days = Math.min(365, Number(n));
    else if (days === null && n in DAY_WORDS) days = DAY_WORDS[n];
    else if (FILLER.has(n) && kept.length === 0) continue;
    else kept.push(t);
  }
  return { days: days ?? 3, rest: kept.join(" ").trim() };
}

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/**
 * Entiende:  /pendientes · /buscar ana · contactado · rechazó precio alto · ganado 5000 · nota llamar el lunes
 * `rest` conserva el texto original (con acentos y mayúsculas) después de la primera palabra.
 */
export function parseMessage(raw: string): Parsed | null {
  const text = raw.trim();
  if (!text) return null;

  if (text.startsWith("/")) {
    const [head, ...tail] = text.split(/\s+/);
    return { kind: "command", name: head.slice(1).split("@")[0].toLowerCase(), rest: tail.join(" ") };
  }

  const [first, ...tail] = text.split(/\s+/);
  const word = normalize(first).replace(/[^a-z]/g, "");
  // "contacté a Pérez" / "ganado con Pérez": se quita la palabra de enlace para buscar por nombre
  const rest = tail.join(" ").replace(/^(a|al|con)\s+/i, "").trim();

  // "correo Pérez", "propuesta por correo Pérez", "email"
  if (PROPOSAL_WORDS.has(word)) {
    return { kind: "proposal", rest: tail.join(" ").replace(/^((por|a|al|para|de|del|el|la|con|correo|email|mail|propuesta)(\s+|$))+/i, "").trim() };
  }
  // "sitio Pérez", "revisar sitio Pérez", "auditar"
  if (AUDIT_WORDS.has(word)) return { kind: "audit", rest: tail.join(" ").replace(/^((sitio|web|de|del|a|al|la|el)(\s+|$))+/i, "").trim() };
  if (FOLLOWUP_WORDS.has(word)) return { kind: "followup", ...parseFollowup(tail.join(" ")) };
  if (word === "nota") return { kind: "note", rest: tail.join(" ").trim() };
  // "no interesa" son dos palabras
  if (word === "no" && normalize(tail[0] ?? "").startsWith("interes")) {
    return { kind: "status", status: "lost", rest: tail.slice(1).join(" ").replace(/^(a|al|con)\s+/i, "").trim() };
  }
  const status = KEYWORDS[word];
  return status ? { kind: "status", status, rest } : null;
}

/** Primer número del texto ("5,000" o "5000.50") para el valor de un trato ganado. */
export function firstNumber(text: string): number | null {
  const m = text.replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}
