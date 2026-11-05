import { query } from "../db.js";
import { normalizeWebsite } from "./url.js";

// Aparte de runner.ts (que usa Playwright) para que el bot pueda correr en el Worker de Cloudflare:
// aquí solo se encola la revisión; la ejecuta pollSiteAudits (Railway o GitHub Actions).

export type RequestResult = "queued" | "already" | "no_website" | "unavailable";

/** Encola la revisión del sitio de un prospecto (si no hay ya una en curso). */
export async function requestAudit(leadId: string): Promise<RequestResult> {
  const lead = await query<{ website: string | null }>("SELECT website FROM leads WHERE id = $1", [leadId]).then((r) => r.rows[0], () => undefined);
  const url = normalizeWebsite(lead?.website as string | null | undefined);
  if (!url) return "no_website";

  let open: { id: string }[];
  try {
    ({ rows: open } = await query<{ id: string }>("SELECT id FROM site_audits WHERE lead_id = $1 AND status IN ('pending', 'running') LIMIT 1", [leadId]));
  } catch {
    return "unavailable"; // falta la migración 0011
  }
  if (open.length) return "already";

  return query("INSERT INTO site_audits (lead_id, url) VALUES ($1, $2)", [leadId, url]).then(
    () => "queued" as const,
    () => "unavailable" as const
  );
}
