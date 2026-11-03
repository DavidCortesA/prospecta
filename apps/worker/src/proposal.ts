import { config } from "./config.js";
import { getLead } from "./leads.js";
import { emailDraftFor } from "./messages.js";
import { escapeHtml, notify, type Keyboard } from "./telegram.js";

export type ProposalResult = "sent" | "no_email" | "no_template" | "not_found";

const MAX_BODY_CHARS = 2800; // Telegram admite 4096 caracteres por mensaje

/**
 * Manda a Telegram la propuesta por correo ya escrita para este prospecto (con la plantilla de correo por defecto).
 * Telegram no admite botones `mailto:`, así que el correo va en texto copiable y con botones para abrirlo en Gmail o Outlook.
 */
export async function sendEmailProposal(leadId: string): Promise<ProposalResult> {
  const lead = await getLead(leadId);
  if (!lead) return "not_found";
  if (!lead.email) return "no_email";

  const draft = await emailDraftFor(lead);
  if (!draft) return "no_template";

  const body = draft.body.length > MAX_BODY_CHARS ? `${draft.body.slice(0, MAX_BODY_CHARS)}…` : draft.body;
  const text =
    `✉️ <b>Propuesta por correo</b> · ${escapeHtml(draft.templateName)}\n` +
    `${escapeHtml(lead.name)}\n\n` +
    `Para: <code>${escapeHtml(draft.to)}</code>\n` +
    `Asunto: <code>${escapeHtml(draft.subject)}</code>\n\n` +
    `<pre>${escapeHtml(body)}</pre>\n` +
    `Toca el asunto o el texto para copiarlos, o ábrelo ya redactado en tu correo.`;

  const keyboard: Keyboard = [
    [
      { text: "Abrir en Gmail", url: draft.gmailUrl },
      { text: "Abrir en Outlook", url: draft.outlookUrl },
    ],
    [{ text: "✅ Ya lo envié (marcar contactado)", callback_data: `s:${lead.id}:c` }],
  ];
  if (config.dashboardUrl) keyboard.push([{ text: "Abrir en el dashboard", url: `${config.dashboardUrl}/prospectos/${lead.id}` }]);

  await notify(text, keyboard);
  return "sent";
}
