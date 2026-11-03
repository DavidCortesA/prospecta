import type { LeadInput } from "./db.js";

/**
 * Score inicial (0-100) para ordenar "a quién atender primero":
 * se puede contactar (correo / teléfono) y tiene oportunidad (no tiene sitio web).
 */
export function leadScore(lead: LeadInput): number {
  let score = 10;
  if (lead.email) score += 30;
  if (lead.phone) score += 25;
  if (!lead.website) score += 30; // sin sitio web = oportunidad de venta
  if (lead.company) score += 5;
  return Math.min(100, score);
}
