import { dbRow, dbRows, query } from "@/lib/db";
import { runAgent, type AgentContext, type ChatTurn } from "./agent";
import { sendText, type InboundMessage } from "./kapso";

/**
 * Quién recibe respuestas automáticas. Por seguridad, de entrada SOLO los números de prueba
 * (WHATSAPP_TEST_NUMBERS, separados por coma). Para clientes reales: WHATSAPP_AUTOREPLY=all.
 */
export function autoReplyAllowed(phone: string): boolean {
  if (process.env.WHATSAPP_AUTOREPLY === "all") return true;
  const list = (process.env.WHATSAPP_TEST_NUMBERS ?? "").split(",").map((s) => s.replace(/\D/g, "")).filter(Boolean);
  return list.includes(phone);
}

const MAX_INBOUND_PER_HOUR = 30; // freno ante spam o bucles: evita que un número gaste tu cuenta de IA
const HISTORY_LIMIT = 20;

/** Aviso por Telegram (si el web tiene TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID). Nunca lanza. */
async function notify(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) {
    console.warn("WhatsApp: sin TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID en la web; aviso omitido:", text);
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.error("WhatsApp: no se pudo avisar por Telegram", e);
  }
}

async function loadContext(phone: string): Promise<AgentContext> {
  const catalog = await dbRows<{ name: string; description: string | null; price: number }>(
    "select name, description, price from public.features where active order by category, name limit 40"
  );
  let knownName: string | null = null;
  let quoteUrl: string | null = null;
  const tail = phone.slice(-10);
  if (tail.length === 10) {
    const lead = await dbRow<{ id: string; name: string }>(
      `select id, name from public.leads
        where right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = $1
        order by created_at desc limit 1`,
      [tail]
    );
    if (lead.data) {
      knownName = lead.data.name;
      const base = process.env.DASHBOARD_URL?.replace(/\/$/, "");
      if (base) {
        const q = await dbRow<{ share_token: string }>(
          "select share_token from public.quotes where lead_id = $1 and status in ('sent','accepted') order by created_at desc limit 1",
          [lead.data.id]
        );
        if (q.data?.share_token) quoteUrl = `${base}/q/${q.data.share_token}`;
      }
    }
  }
  return { catalog: catalog.data ?? [], knownName, quoteUrl };
}

/**
 * Procesa los mensajes nuevos de UN cliente: los guarda (sin duplicar) y, si corresponde, responde con el agente.
 * Se llama después de contestar el webhook, para cumplir los 10 s que exige Kapso.
 */
export async function handleInbound(msgs: InboundMessage[]) {
  if (!msgs.length) return;
  const { from: phone, phoneNumberId, contactName } = msgs[0];

  await query(
    `insert into public.whatsapp_conversations (phone, contact_name) values ($1, $2)
     on conflict (phone) do update set contact_name = coalesce(excluded.contact_name, whatsapp_conversations.contact_name), updated_at = now()`,
    [phone, contactName]
  );

  // Guarda cada mensaje; si Kapso reintenta la entrega, el wamid repetido se ignora
  let fresh = 0;
  let nonText = false;
  for (const m of msgs) {
    const body = m.text ?? `[${m.type}]`;
    const r = await query(
      `insert into public.whatsapp_messages (phone, direction, sender, body, kapso_message_id)
       values ($1, 'in', 'customer', $2, $3) on conflict (kapso_message_id) do nothing`,
      [phone, body.slice(0, 4000), m.messageId]
    );
    if (r.rowCount) {
      fresh++;
      if (!m.text) nonText = true;
    }
  }
  if (!fresh) return;

  const conv = await dbRow<{ handoff: boolean }>("select handoff from public.whatsapp_conversations where phone = $1", [phone]);
  if (conv.data?.handoff) return; // una persona atiende esta conversación
  if (!autoReplyAllowed(phone)) return; // respuestas automáticas aún no activadas para este número

  const recent = await dbRow<{ n: number }>(
    "select count(*)::int as n from public.whatsapp_messages where phone = $1 and direction = 'in' and created_at > now() - interval '1 hour'",
    [phone]
  );
  if ((recent.data?.n ?? 0) > MAX_INBOUND_PER_HOUR) {
    await notify(`WhatsApp: +${phone} superó ${MAX_INBOUND_PER_HOUR} mensajes en una hora; el agente dejó de contestarle.`);
    return;
  }

  const store = (body: string) =>
    query("insert into public.whatsapp_messages (phone, direction, sender, body) values ($1, 'out', 'ai', $2)", [phone, body]);

  try {
    // Audios, imágenes, etc.: el agente solo lee texto
    if (nonText && msgs.every((m) => !m.text)) {
      const text = "Por ahora solo puedo leer mensajes de texto. ¿Me escribes lo que necesitas?";
      await sendText(phoneNumberId, phone, text);
      await store(text);
      return;
    }

    const hist = await dbRows<{ direction: string; body: string }>(
      "select direction, body from (select direction, body, created_at from public.whatsapp_messages where phone = $1 order by created_at desc limit $2) t order by created_at",
      [phone, HISTORY_LIMIT]
    );
    const history: ChatTurn[] = (hist.data ?? []).map((h) => ({ role: h.direction === "in" ? "user" : "assistant", content: h.body }));

    const result = await runAgent(history, await loadContext(phone));
    if (result.reply) {
      await sendText(phoneNumberId, phone, result.reply);
      await store(result.reply);
    }

    const who = `${contactName ?? "Cliente"} (+${phone})`;
    if (result.callRequest) {
      await notify(`📞 WhatsApp: ${who} quiere una llamada.\nCuándo: ${result.callRequest.when}\nTema: ${result.callRequest.topic}\nResponder: https://wa.me/${phone}`);
    }
    if (result.handoff) {
      await query(
        "update public.whatsapp_conversations set handoff = true, handoff_reason = $2, handoff_at = now(), updated_at = now() where phone = $1",
        [phone, result.handoff.reason]
      );
      await notify(`🙋 WhatsApp: ${who} necesita a una persona.\nMotivo: ${result.handoff.reason}\nResponder: https://wa.me/${phone}\nEl agente ya no le contestará.`);
    }
  } catch (e) {
    console.error("WhatsApp: falló el agente", e);
    await notify(`⚠️ WhatsApp: el agente no pudo contestar a +${phone}.\n${e instanceof Error ? e.message.slice(0, 300) : String(e)}`);
  }
}
