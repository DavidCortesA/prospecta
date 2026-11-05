import { config } from "../config.js";
import { query } from "../db.js";
import { getLead } from "../leads.js";
import { escapeHtml, notify, type Keyboard } from "../telegram.js";
import { AuditError, auditSite, type Issue } from "./site.js";

const AUDIT_TIMEOUT_MS = 75_000;
const STALE_RUNNING_MS = 10 * 60 * 1000;

let busy = false;

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
    await query(
      "UPDATE site_audits SET status = 'failed', error = $1, finished_at = $2 WHERE status = 'running' AND created_at < $3",
      [
        "Se interrumpió la revisión (reinicio del servidor). Vuelve a intentarlo.",
        new Date().toISOString(),
        new Date(Date.now() - STALE_RUNNING_MS).toISOString(),
      ]
    ).catch(() => {});

    let pending: { id: string; lead_id: string; url: string }[];
    try {
      ({ rows: pending } = await query<{ id: string; lead_id: string; url: string }>(
        "SELECT id, lead_id, url FROM site_audits WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
      ));
    } catch {
      return; // falta la migración 0011
    }

    for (const audit of pending) {
      const claimed = await query("UPDATE site_audits SET status = 'running' WHERE id = $1 AND status = 'pending' RETURNING id", [audit.id]).then(
        (r) => r.rows,
        () => []
      );
      if (!claimed.length) continue;
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
    await query(
      `UPDATE site_audits SET status = 'done', url = $1, score = $2, headline = $3, metrics = $4::jsonb, issues = $5::jsonb,
              screenshot = $6, finished_at = $7 WHERE id = $8`,
      [
        result.finalUrl,
        result.score,
        result.headline,
        JSON.stringify(result.metrics),
        JSON.stringify(result.issues),
        result.screenshot,
        new Date().toISOString(),
        audit.id,
      ]
    ).catch(() => {});

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
    await query("UPDATE site_audits SET status = 'failed', error = $1, finished_at = $2 WHERE id = $3", [message, new Date().toISOString(), audit.id]).catch(
      () => {}
    );
    await notify(`⚠️ <b>No se pudo revisar el sitio</b>\n${escapeHtml(label)}\n${escapeHtml(message)}`, button);
  }
}
