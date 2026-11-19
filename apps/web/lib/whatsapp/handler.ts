import { dbRow, query } from "@/lib/db";
import type { InboundMessage } from "./kapso";

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

/** "BAJA", "stop", "no me escriban más"…: quien lo pide no debe recibir más mensajes. */
const OPT_OUT = /\b(baja|stop|cancelar|no\s+(me\s+)?(escrib|molest|contact|vuelv)\w*|dej(a|en)\s+de\s+(escribir|molestar))/i;

/**
 * Registra lo que responde un prospecto. NO contesta: el sistema solo manda el primer mensaje y, cuando
 * alguien responde, el prospecto pasa a «Respondió» y te llega un aviso por Telegram para que entres tú.
 */
export async function handleInbound(msgs: InboundMessage[]) {
  if (!msgs.length) return;
  const { from: phone, contactName } = msgs[0];

  await query(
    `insert into public.whatsapp_conversations (phone, contact_name) values ($1, $2)
     on conflict (phone) do update set contact_name = coalesce(excluded.contact_name, whatsapp_conversations.contact_name), updated_at = now()`,
    [phone, contactName]
  );

  // Guarda cada mensaje; si Kapso reintenta la entrega, el wamid repetido se ignora (y no vuelve a avisar)
  const fresh: string[] = [];
  for (const m of msgs) {
    const body = m.text ?? `[${m.type}]`;
    const r = await query(
      `insert into public.whatsapp_messages (phone, direction, sender, body, kapso_message_id)
       values ($1, 'in', 'customer', $2, $3) on conflict (kapso_message_id) do nothing`,
      [phone, body.slice(0, 4000), m.messageId]
    );
    if (r.rowCount) fresh.push(body);
  }
  if (!fresh.length) return;

  // ¿Es alguien a quien contactamos? Se compara por los últimos 10 dígitos (el teléfono se guarda con cualquier formato)
  const tail = phone.slice(-10);
  const lead =
    tail.length === 10
      ? (
          await dbRow<{ id: string; name: string; status: string }>(
            `select id, name, status from public.leads
              where right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = $1
              order by created_at desc limit 1`,
            [tail]
          )
        ).data
      : null;

  if (lead) {
    await query("update public.whatsapp_conversations set lead_id = $2 where phone = $1", [phone, lead.id]);
    // Solo avanza el embudo hacia «Respondió»; nunca retrocede un prospecto calificado, ganado o perdido
    if (lead.status === "new" || lead.status === "contacted") {
      await query("update public.leads set status = 'replied' where id = $1 and status in ('new', 'contacted')", [lead.id]);
    }
  }

  const base = process.env.DASHBOARD_URL?.replace(/\/$/, "");
  const who = lead ? `${lead.name} (+${phone})` : `${contactName ?? "Número desconocido"} (+${phone})`;
  const shown = fresh.join("\n").slice(0, 600);
  const optOut = fresh.some((t) => OPT_OUT.test(t));
  await notify(
    [
      `💬 WhatsApp: respondió ${who}`,
      "",
      shown,
      "",
      optOut ? "⛔ Parece que pidió no recibir más mensajes: no le escribas." : "",
      `Responder: https://wa.me/${phone}`,
      lead && base ? `Prospecto: ${base}/prospectos/${lead.id}` : "",
    ]
      .filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== ""))
      .join("\n")
      .trim()
  );
}
