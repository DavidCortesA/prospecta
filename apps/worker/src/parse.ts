import type { LeadStatus } from "./leads.js";

export type Parsed =
  | { kind: "command"; name: string; rest: string }
  | { kind: "status"; status: LeadStatus; rest: string }
  | { kind: "note"; rest: string };

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

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

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
