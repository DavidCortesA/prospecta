// Primer mensaje automático por WhatsApp (Kapso). El sistema SOLO inicia la conversación con una plantilla
// aprobada por Meta; cuando el prospecto responde, el webhook de la web te avisa y entras tú.
// La lógica recibe sus dependencias (base de datos, envío, aviso) para poder probarla sin red.
import { templateVars, whatsappNumber, type TemplateLead } from "../messages.js";

export type OutreachConfig = {
  enabled: boolean;
  templateName?: string;
  templateLang: string;
  templateVars: string[];
  dailyLimit: number;
  perRun: number;
  hours: string; // "9-18"
  minScore: number;
  timezone: string;
};

export type OutreachDeps = {
  // `any` en las filas: igual que el cliente de pg, que tampoco las tipa sin ayuda
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: <T = any>(text: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount: number | null }>;
  /** Envía la plantilla; devuelve el id del mensaje de WhatsApp */
  send: (to: string, params: string[]) => Promise<string | null>;
  notify: (text: string) => Promise<unknown>;
  sleep: (ms: number) => Promise<void>;
  escape: (s: string) => string;
};

type Lead = TemplateLead & { id: string; phone: string | null };

/** Errores que son del destinatario (no tiene WhatsApp, número inválido), no de la cuenta o la plantilla. */
const RECIPIENT_ERROR = /131026|undeliverable|not a (valid )?whatsapp|no whatsapp|invalid (phone|recipient|number)|not registered|incapable/i;

/** Meta rechaza variables vacías o con saltos de línea, tabuladores o más de 4 espacios seguidos. */
export function cleanParam(v: string | undefined): string {
  return (v ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || "su negocio";
}

/** ¿Estamos dentro del horario de envío? Lunes a sábado, en la zona horaria de la app. */
export function inSendWindow(now: Date, hours: string, timezone: string): boolean {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(hours.trim());
  const [start, end] = m ? [Number(m[1]), Number(m[2])] : [9, 18];
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false, weekday: "short" }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value) % 24;
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  return weekday !== "Sun" && hour >= start && hour < end;
}

/** Prospectos a los que toca escribir: nuevos, con teléfono, sin mensaje previo y por score descendente. */
export async function pendingLeads(deps: OutreachDeps, cfg: OutreachConfig, limit: number): Promise<Lead[]> {
  const { rows } = await deps.query<Lead>(
    `select l.id, l.name, l.company, l.city, l.notes, l.phone
       from public.leads l
      where l.status = 'new' and l.phone is not null and l.score >= $1
        and not exists (select 1 from public.whatsapp_outreach o where o.lead_id = l.id)
      order by l.score desc, l.created_at asc
      limit $2`,
    [cfg.minScore, limit]
  );
  return rows;
}

/** Cuántos primeros mensajes se reservaron o enviaron hoy (día natural en la zona horaria de la app). */
async function sentToday(deps: OutreachDeps, tz: string): Promise<number> {
  const { rows } = await deps.query<{ n: number }>(
    `select count(*)::int as n from public.whatsapp_outreach
      where status in ('pending', 'sent')
        and created_at >= (date_trunc('day', now() at time zone $1) at time zone $1)`,
    [tz]
  );
  return rows[0]?.n ?? 0;
}

export async function runOutreach(deps: OutreachDeps, cfg: OutreachConfig, now = new Date()) {
  if (!cfg.enabled) return { sent: 0, failed: 0, skipped: "apagado" as const };
  if (!cfg.templateName) throw new Error("Falta WHATSAPP_TEMPLATE_NAME (plantilla aprobada por Meta)");
  if (!inSendWindow(now, cfg.hours, cfg.timezone)) return { sent: 0, failed: 0, skipped: "fuera de horario" as const };

  const remaining = cfg.dailyLimit - (await sentToday(deps, cfg.timezone));
  const take = Math.min(remaining, cfg.perRun);
  if (take <= 0) return { sent: 0, failed: 0, skipped: "límite diario" as const };

  const sent: string[] = [];
  const failed: string[] = [];
  let consecutiveFailures = 0;
  let aborted = false;

  // Se piden de más porque algunos teléfonos no son válidos o ya tienen conversación y se descartan
  for (const lead of await pendingLeads(deps, cfg, take * 4)) {
    if (sent.length + failed.length >= take) break; // intentos reales de envío; los descartados no cuentan
    const to = whatsappNumber(lead.phone);

    // Se reserva la fila ANTES de enviar: si otra corrida va en paralelo, solo una gana
    const claim = await deps.query<{ id: string }>(
      `insert into public.whatsapp_outreach (lead_id, phone, template_name, status, error)
       values ($1, $2, $3, $4, $5) on conflict (lead_id) do nothing returning id`,
      [lead.id, to ?? lead.phone ?? "", cfg.templateName, to ? "pending" : "failed", to ? null : "teléfono no válido"]
    );
    if (!claim.rows[0]) continue;
    if (!to) continue; // quedó registrado como fallido para no volver a elegirlo

    // Nunca se le escribe a quien ya tiene conversación con nosotros ni a un número ya contactado por otro prospecto
    const dup = await deps.query(
      `select 1 from public.whatsapp_messages where phone = $1
       union all select 1 from public.whatsapp_outreach where phone = $1 and status in ('pending', 'sent') and lead_id <> $2 limit 1`,
      [to, lead.id]
    );
    if (dup.rows.length) {
      await deps.query("update public.whatsapp_outreach set status = 'failed', error = 'número ya contactado' where lead_id = $1", [lead.id]);
      continue;
    }

    const vars = templateVars(lead);
    const params = cfg.templateVars.map((k) => cleanParam(vars[k]));
    try {
      const messageId = await deps.send(to, params);
      await deps.query("update public.whatsapp_outreach set status = 'sent', sent_at = now(), kapso_message_id = $2 where lead_id = $1", [lead.id, messageId]);
      // «Contactado»: el trigger de la base agenda el seguimiento a 3 días y la bitácora registra el cambio
      await deps.query("update public.leads set status = 'contacted' where id = $1 and status = 'new'", [lead.id]);
      await deps.query(
        `insert into public.whatsapp_conversations (phone, contact_name, lead_id) values ($1, $2, $3)
         on conflict (phone) do update set lead_id = excluded.lead_id, updated_at = now()`,
        [to, lead.name, lead.id]
      );
      await deps.query(
        `insert into public.whatsapp_messages (phone, direction, sender, body, kapso_message_id) values ($1, 'out', 'system', $2, $3)
         on conflict (kapso_message_id) do nothing`,
        [to, `[Plantilla ${cfg.templateName}] ${params.join(" · ")}`, messageId]
      );
      sent.push(lead.name);
      consecutiveFailures = 0;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await deps.query("update public.whatsapp_outreach set status = 'failed', error = $2 where lead_id = $1", [lead.id, msg.slice(0, 500)]);
      failed.push(`${lead.name}: ${msg.slice(0, 160)}`);
      // Un teléfono fijo o sin WhatsApp es problema de ESE prospecto: no cuenta. Varios fallos seguidos de otro tipo
      // suelen ser plantilla sin aprobar, llave inválida o cuenta limitada: se detiene todo.
      if (!RECIPIENT_ERROR.test(msg) && ++consecutiveFailures >= 3) {
        aborted = true;
        break;
      }
    }
    await deps.sleep(3000);
  }

  if (sent.length || failed.length) {
    await deps.notify(
      [
        sent.length ? `📤 <b>WhatsApp</b>: primer mensaje enviado a ${sent.length}` : "",
        ...sent.map((n) => `· ${deps.escape(n)}`),
        failed.length ? `⚠️ No se pudo enviar a ${failed.length}:` : "",
        ...failed.map((f) => `· ${deps.escape(f)}`),
        aborted ? "⛔ Se detuvo el envío por 3 fallos seguidos. Revisa la plantilla, la llave de Kapso y el número." : "",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
  return { sent: sent.length, failed: failed.length, skipped: null };
}

/** Envío real por la API de Kapso (proxy de la API de WhatsApp Cloud). */
export function kapsoSender(apiKey: string, phoneNumberId: string, templateName: string, lang: string) {
  return async (to: string, params: string[]): Promise<string | null> => {
    const res = await fetch(`https://api.kapso.ai/meta/whatsapp/v24.0/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: lang },
          ...(params.length ? { components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] } : {}),
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Kapso ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { messages?: { id?: string }[] };
    return data.messages?.[0]?.id ?? null;
  };
}
