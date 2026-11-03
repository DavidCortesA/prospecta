import { config } from "./config.js";
import { escapeHtml, notify, tg } from "./telegram.js";
import {
  CODE_TO_STATUS,
  STATUS_EMOJI,
  STATUS_LABEL,
  addNote,
  changeStatus,
  findLeads,
  getLead,
  leadForMessage,
  pendingLeads,
  sendLeadCard,
  statusCounts,
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
  "• <code>nota llamar el lunes</code>",
  "",
  "Sin responder a un aviso, escribe la palabra y el nombre: <code>contactado Pérez</code>.",
  "",
  "Comandos: /pendientes · /buscar nombre · /resumen · /ayuda",
].join("\n");

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

async function handleCallback(cb: NonNullable<TgUpdate["callback_query"]>) {
  const msg = cb.message;
  if (!msg || !authorized(msg.chat.id)) {
    await tg("answerCallbackQuery", { callback_query_id: cb.id });
    return;
  }

  const [kind, leadId, code] = (cb.data ?? "").split(":");
  const status = CODE_TO_STATUS[code];
  if (kind !== "s" || !leadId || !status) {
    await tg("answerCallbackQuery", { callback_query_id: cb.id });
    return;
  }

  const lead = await changeStatus(leadId, status);
  if (!lead) {
    await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "No se pudo actualizar", show_alert: true });
    return;
  }
  await tg("answerCallbackQuery", { callback_query_id: cb.id, text: `${STATUS_EMOJI[status]} ${lead.name}: ${STATUS_LABEL[status]}` });

  // Actualiza la línea "Estado:" del mismo mensaje conservando el formato original
  if (msg.text) {
    const line = `Estado: ${STATUS_EMOJI[status]} ${STATUS_LABEL[status]}`;
    const text = /\nEstado: .*$/.test(msg.text) ? msg.text.replace(/\nEstado: .*$/, `\n${line}`) : `${msg.text}\n${line}`;
    await tg("editMessageText", {
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      text,
      entities: msg.entities,
      reply_markup: msg.reply_markup,
      disable_web_page_preview: true,
    });
  }
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
            (status === "won" ? "\nSe creó el cliente y su proyecto en el dashboard." : "") +
            (status === "lost" && parsed.rest ? `\nMotivo: ${escapeHtml(parsed.rest)}` : "")
        : "No se pudo actualizar el prospecto."
    ));
  }

  if (!parsed.rest) {
    return void (await reply(`Responde a un aviso o escribe el nombre: <code>${STATUS_LABEL[status].toLowerCase()} Pérez</code>`));
  }
  const matches = await findLeads(parsed.rest);
  if (!matches.length) return void (await reply(`No encontré prospectos con “${escapeHtml(parsed.rest)}”.`));
  if (matches.length === 1) {
    const lead = await changeStatus(matches[0].id, status);
    return void (await reply(lead ? `${STATUS_EMOJI[status]} <b>${escapeHtml(lead.name)}</b> → ${STATUS_LABEL[status]}` : "No se pudo actualizar el prospecto."));
  }
  await reply(`Encontré ${matches.length} coincidencias. Elige con los botones:`);
  for (const l of matches) await sendLeadCard(l, "Prospecto");
}
