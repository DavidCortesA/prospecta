import { config } from "./config.js";
import { dayLabel } from "./dates.js";
import { requestAudit, type RequestResult } from "./audit/runner.js";
import { sendDigest } from "./digest.js";
import { escapeHtml, notify, tg } from "./telegram.js";
import {
  CODE_TO_STATUS,
  STATUS_EMOJI,
  STATUS_LABEL,
  addNote,
  changeStatus,
  findLeads,
  followupLine,
  getLead,
  leadForMessage,
  pendingLeads,
  sendLeadCard,
  setFollowupIn,
  statusCounts,
  statusLine,
  type LeadStatus,
} from "./leads.js";
import { firstNumber, parseMessage } from "./parse.js";

type TgMessage = {
  message_id: number;
  text?: string;
  entities?: unknown[];
  chat: { id: number };
  reply_to_message?: { message_id: number };
  reply_markup?: unknown;
};
type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  callback_query?: { id: string; data?: string; message?: TgMessage };
};

const HELP = [
  "<b>Prospecta bot</b>",
  "",
  "Toca los botones de cada aviso, o <b>responde</b> al aviso con una palabra:",
  "• <code>contactado</code> · <code>respondió</code> · <code>calificado</code>",
  "• <code>ganado 5000</code> (valor opcional)",
  "• <code>rechazó precio alto</code> (motivo opcional)",
  "• <code>recordar 3</code> (seguimiento en 3 días; también <code>recordar mañana</code> o <code>recordar semana</code>)",
  "• <code>nota llamar el lunes</code>",
  "",
  "Sin responder a un aviso, escribe la palabra y el nombre: <code>contactado Pérez</code>.",
  "",
  "• <code>sitio</code> (revisa el sitio web del prospecto: velocidad, celular, HTTPS, contacto…)",
  "",
  "Comandos: /seguimientos · /pendientes · /buscar nombre · /sitio nombre · /resumen · /ayuda",
  "Cada mañana te mando el resumen del día automáticamente.",
].join("\n");

const AUDIT_REPLY: Record<RequestResult, string> = {
  queued: "🔎 Revisando el sitio web… te aviso en un minuto.",
  already: "Ya hay una revisión de este sitio en curso.",
  no_website: "Este prospecto no tiene sitio web.",
  unavailable: "Falta aplicar la migración 0011 en Supabase.",
};

const authorized = (chatId: number) => String(chatId) === String(config.telegramChatId);

export function startTelegramBot(): () => void {
  if (!config.telegramToken || !config.telegramChatId) {
    console.log("Telegram sin configurar: el bot interactivo no se inicia");
    return () => {};
  }

  const controller = new AbortController();
  let stopped = false;

  (async () => {
    // getUpdates no funciona si el bot tiene un webhook; se quita por si acaso.
    await tg("deleteWebhook", { drop_pending_updates: false });
    await tg("setMyCommands", {
      commands: [
        { command: "seguimientos", description: "Seguimientos de hoy y vencidos" },
        { command: "pendientes", description: "Prospectos nuevos por contactar" },
        { command: "buscar", description: "Buscar un prospecto por nombre" },
        { command: "resumen", description: "Conteo por estado" },
        { command: "ayuda", description: "Cómo usar el bot" },
      ],
    });

    let offset = 0;
    while (!stopped) {
      const updates = await tg<TgUpdate[]>(
        "getUpdates",
        { offset, timeout: 25, allowed_updates: ["message", "callback_query"] },
        controller.signal
      );
      if (updates === null) {
        // 409 durante un redeploy (dos instancias a la vez) u otro fallo de red: se reintenta
        if (!stopped) await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      for (const u of updates) {
        offset = u.update_id + 1;
        try {
          await handle(u);
        } catch (err) {
          console.error("Error atendiendo update de Telegram:", (err as Error).message);
        }
      }
    }
  })();

  return () => {
    stopped = true;
    controller.abort();
  };
}

async function handle(u: TgUpdate) {
  if (u.callback_query) return handleCallback(u.callback_query);
  if (u.message?.text) return handleText(u.message);
}

/** Reemplaza (o agrega) una línea del texto del mensaje que empieza con `prefix`; quita la línea si `line` es null. */
function setLine(text: string, prefix: string, line: string | null): string {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l.startsWith(prefix));
  if (i >= 0) {
    if (line === null) lines.splice(i, 1);
    else lines[i] = line;
  } else if (line !== null) {
    lines.push(line);
  }
  return lines.join("\n");
}

/** Actualiza en el mismo aviso las líneas "Estado" y "Seguimiento" conservando el formato original. */
async function refreshCard(msg: TgMessage, lead: { status: LeadStatus; next_followup: string | null }) {
  if (!msg.text) return;
  let text = setLine(msg.text, "Estado: ", statusLine(lead.status));
  text = setLine(text, "📅 Seguimiento:", followupLine(lead.next_followup));
  if (text === msg.text) return;
  await tg("editMessageText", {
    chat_id: msg.chat.id,
    message_id: msg.message_id,
    text,
    entities: msg.entities,
    reply_markup: msg.reply_markup,
    disable_web_page_preview: true,
  });
}

async function handleCallback(cb: NonNullable<TgUpdate["callback_query"]>) {
  const msg = cb.message;
  const answer = (text?: string, alert = false) => tg("answerCallbackQuery", { callback_query_id: cb.id, text, show_alert: alert });
  if (!msg || !authorized(msg.chat.id)) return void (await answer());

  const [kind, leadId, code] = (cb.data ?? "").split(":");
  if (!leadId) return void (await answer());

  if (kind === "s") {
    const status = CODE_TO_STATUS[code];
    if (!status) return void (await answer());
    const lead = await changeStatus(leadId, status);
    if (!lead) return void (await answer("No se pudo actualizar", true));
    await answer(`${STATUS_EMOJI[status]} ${lead.name}: ${STATUS_LABEL[status]}`);
    await refreshCard(msg, lead);
    return;
  }

  if (kind === "a") {
    const result = await requestAudit(leadId);
    return void (await answer(AUDIT_REPLY[result], result === "no_website" || result === "unavailable"));
  }

  if (kind === "f") {
    const days = Number(code);
    const date = await setFollowupIn(leadId, Number.isFinite(days) ? days : 3);
    if (date === undefined) return void (await answer("No se pudo agendar", true));
    const lead = await getLead(leadId);
    await answer(date ? `⏰ Seguimiento: ${dayLabel(date)}` : "Seguimiento quitado");
    if (lead) await refreshCard(msg, lead);
    return;
  }

  await answer();
}

async function handleText(msg: TgMessage) {
  if (!authorized(msg.chat.id)) return; // solo atiende a tu chat
  const chatId = String(msg.chat.id);
  const reply = (text: string) => notify(text, undefined, chatId);
  const parsed = parseMessage(msg.text ?? "");

  if (!parsed) {
    await reply("No entendí ese mensaje. Escribe /ayuda para ver cómo usarme.");
    return;
  }

  if (parsed.kind === "command") {
    switch (parsed.name) {
      case "start":
      case "ayuda":
      case "help":
        await reply(HELP);
        return;
      case "hoy":
      case "seguimientos":
        await sendDigest(true);
        return;
      case "resumen": {
        const c = await statusCounts();
        const total = Object.values(c).reduce((a, b) => a + b, 0);
        await reply(
          `<b>Resumen</b> (${total} prospectos)\n` +
            (Object.keys(STATUS_LABEL) as LeadStatus[]).map((s) => `${STATUS_EMOJI[s]} ${STATUS_LABEL[s]}: ${c[s] ?? 0}`).join("\n")
        );
        return;
      }
      case "pendientes": {
        const leads = await pendingLeads(5);
        if (!leads.length) return void (await reply("No tienes prospectos nuevos por contactar 🎉"));
        for (const l of leads) await sendLeadCard(l, "Por contactar");
        return;
      }
      case "sitio": {
        const target = await resolveByName(parsed.rest, reply, "/sitio Pérez");
        if (target) await reply(AUDIT_REPLY[await requestAudit(target)]);
        return;
      }
      case "buscar": {
        if (!parsed.rest) return void (await reply("Escribe el nombre: <code>/buscar Pérez</code>"));
        const leads = await findLeads(parsed.rest);
        if (!leads.length) return void (await reply(`No encontré prospectos con “${escapeHtml(parsed.rest)}”.`));
        for (const l of leads) await sendLeadCard(l, "Prospecto");
        return;
      }
      default:
        await reply("Ese comando no existe. Escribe /ayuda.");
        return;
    }
  }

  // Palabras clave: primero se intenta con el aviso al que se respondió, si no, con el nombre escrito.
  let leadId: string | null = null;
  const repliedTo = msg.reply_to_message?.message_id;
  if (repliedTo) {
    leadId = await leadForMessage(repliedTo);
    if (!leadId) return void (await reply("No sé a qué prospecto pertenece ese mensaje (los avisos se recuerdan 30 días)."));
  }

  if (parsed.kind === "note") {
    if (!leadId) return void (await reply("Para agregar una nota, <b>responde</b> al aviso del prospecto: <code>nota llamar el lunes</code>"));
    if (!parsed.rest) return void (await reply("Escribe la nota después de la palabra: <code>nota llamar el lunes</code>"));
    const lead = await getLead(leadId);
    const ok = await addNote(leadId, parsed.rest);
    return void (await reply(ok ? `📝 Nota guardada en ${escapeHtml(lead?.name ?? "el prospecto")}.` : "No se pudo guardar la nota."));
  }

  if (parsed.kind === "audit") {
    const target = leadId ?? (await resolveByName(parsed.rest, reply, "sitio Pérez"));
    if (target) await reply(AUDIT_REPLY[await requestAudit(target)]);
    return;
  }

  if (parsed.kind === "followup") {
    const target = leadId ?? (await resolveByName(parsed.rest, reply, `recordar ${parsed.days} ${parsed.rest || "Pérez"}`.trim()));
    if (!target) return;
    const date = await setFollowupIn(target, parsed.days);
    const lead = await getLead(target);
    return void (await reply(
      date && lead ? `⏰ <b>${escapeHtml(lead.name)}</b>: seguimiento ${parsed.days === 0 ? "hoy" : `el ${dayLabel(date)}`}.` : "No se pudo agendar el seguimiento."
    ));
  }

  // kind === "status"
  const { status } = parsed;
  if (leadId) {
    const lead = await changeStatus(leadId, status, {
      dealValue: status === "won" ? firstNumber(parsed.rest) : null,
      reason: status === "lost" ? parsed.rest || null : null,
    });
    return void (await reply(
      lead
        ? `${STATUS_EMOJI[status]} <b>${escapeHtml(lead.name)}</b> → ${STATUS_LABEL[status]}` +
            (lead.next_followup && status === "contacted" ? `\n📅 Seguimiento: ${dayLabel(lead.next_followup)}` : "") +
            (status === "won" ? "\nSe creó el cliente y su proyecto en el dashboard." : "") +
            (status === "lost" && parsed.rest ? `\nMotivo: ${escapeHtml(parsed.rest)}` : "")
        : "No se pudo actualizar el prospecto."
    ));
  }

  const target = await resolveByName(parsed.rest, reply, `${STATUS_LABEL[status].toLowerCase()} Pérez`);
  if (!target) return;
  const lead = await changeStatus(target, status);
  await reply(lead ? `${STATUS_EMOJI[status]} <b>${escapeHtml(lead.name)}</b> → ${STATUS_LABEL[status]}` : "No se pudo actualizar el prospecto.");
}

/**
 * Busca el prospecto por nombre cuando no se respondió a un aviso. Si hay una sola coincidencia devuelve su id;
 * si hay varias muestra tarjetas con botones y devuelve null; si no hay, avisa.
 */
async function resolveByName(query: string, reply: (t: string) => Promise<unknown>, example: string): Promise<string | null> {
  if (!query) {
    await reply(`Responde a un aviso o escribe el nombre: <code>${escapeHtml(example)}</code>`);
    return null;
  }
  const matches = await findLeads(query);
  if (!matches.length) {
    await reply(`No encontré prospectos con “${escapeHtml(query)}”.`);
    return null;
  }
  if (matches.length === 1) return matches[0].id;
  await reply(`Encontré ${matches.length} coincidencias. Elige con los botones:`);
  for (const l of matches) await sendLeadCard(l, "Prospecto");
  return null;
}
