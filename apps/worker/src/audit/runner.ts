import { config } from "../config.js";
import { db } from "../db.js";
import { getLead } from "../leads.js";
import { escapeHtml, notify, type Keyboard } from "../telegram.js";
import { AuditError, auditSite, type Issue } from "./site.js";
import { normalizeWebsite } from "./ssrf.js";

const AUDIT_TIMEOUT_MS = 75_000;
const STALE_RUNNING_MS = 10 * 60 * 1000;

let busy = false;

export type RequestResult = "queued" | "already" | "no_website" | "unavailable";

/** Encola la revisión del sitio de un prospecto (si no hay ya una en curso). */
export async function requestAudit(leadId: string): Promise<RequestResult> {
  const { data: lead } = await db.from("leads").select("website").eq("id", leadId).maybeSingle();
  const url = normalizeWebsite(lead?.website as string | null | undefined);
  if (!url) return "no_website";

  const { data: open, error } = await db.from("site_audits").select("id").eq("lead_id", leadId).in("status", ["pending", "running"]).limit(1);
  if (error) return "unavailable"; // falta la migración 0011
  if (open?.length) return "already";

  const { error: insertError } = await db.from("site_audits").insert({ lead_id: leadId, url });
  return insertError ? "unavailable" : "queued";
}

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new AuditError("La revisión tardó demasiado y se canceló")), ms))]);

const SEVERITY_ICON: Record<Issue["severity"], string> = { high: "🔴", medium: "🟠", low: "🟡" };
const scoreIcon = (s: number) => (s >= 80 ? "🟢" : s >= 50 ? "🟠" : "🔴");

/**
 * Atiende las revisiones pendientes, de una en una (Chromium consume memoria). Se ejecuta cada ~20 s.
 * Las que quedaron "running" por un reinicio del servidor se marcan como fallidas.
 */
export async function pollSiteAudits(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    await db
      .from("site_audits")
      .update({ status: "failed", error: "Se interrumpió la revisión (reinicio del servidor). Vuelve a intentarlo.", finished_at: new Date().toISOString() })
      .eq("status", "running")
      .lt("created_at", new Date(Date.now() - STALE_RUNNING_MS).toISOString());

    const { data: pending, error } = await db
      .from("site_audits")
      .select("id, lead_id, url")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) return; // falta la migración 0011

    for (const audit of pending ?? []) {
      const { data: claimed } = await db.from("site_audits").update({ status: "running" }).eq("id", audit.id).eq("status", "pending").select("id");
      if (!claimed?.length) continue;
      await run(audit);
    }
  } finally {
    busy = false;
  }
}

async function run(audit: { id: string; lead_id: string; url: string }) {
  const lead = await getLead(audit.lead_id);
  const label = lead ? (lead.company && lead.company !== lead.name ? `${lead.name} — ${lead.company}` : lead.name) : "Prospecto";
  const button: Keyboard | undefined = config.dashboardUrl
    ? [[{ text: "Ver revisión en el dashboard", url: `${config.dashboardUrl}/prospectos/${audit.lead_id}` }]]
    : undefined;

  try {
    const result = await withTimeout(auditSite(audit.url), AUDIT_TIMEOUT_MS);
    await db
      .from("site_audits")
      .update({
        status: "done",
        url: result.finalUrl,
        score: result.score,
        headline: result.headline,
        metrics: result.metrics,
        issues: result.issues,
        screenshot: result.screenshot,
        finished_at: new Date().toISOString(),
      })
      .eq("id", audit.id);

    const top = result.issues.slice(0, 4).map((i) => `${SEVERITY_ICON[i.severity]} ${escapeHtml(i.title)}`);
    await notify(
      `🔎 <b>Revisión del sitio</b>\n${escapeHtml(label)}\n${escapeHtml(result.finalUrl)}\n\n` +
        `${scoreIcon(result.score)} Salud del sitio: <b>${result.score}/100</b>\n` +
        (top.length ? `${top.join("\n")}\n` : "✅ Sin problemas importantes\n") +
        `\n💬 <i>${escapeHtml(result.headline)}</i>`,
      button
    );
  } catch (err) {
    const message = err instanceof AuditError ? err.message : "No se pudo revisar el sitio";
    if (!(err instanceof AuditError)) console.error("Auditoría falló:", (err as Error).message);
    await db.from("site_audits").update({ status: "failed", error: message, finished_at: new Date().toISOString() }).eq("id", audit.id);
    await notify(`⚠️ <b>No se pudo revisar el sitio</b>\n${escapeHtml(label)}\n${escapeHtml(message)}`, button);
  }
}
