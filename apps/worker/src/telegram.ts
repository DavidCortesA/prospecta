import { config } from "./config.js";

export type Button = { text: string; callback_data?: string; url?: string };
export type Keyboard = Button[][];

const base = () => `https://api.telegram.org/bot${config.telegramToken}`;

/** Llama a un método de la Bot API. Devuelve `result` o null si falló (el error se registra, sin el token). */
export async function tg<T = unknown>(method: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T | null> {
  if (!config.telegramToken) return null;
  try {
    const res = await fetch(`${base()}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string; error_code?: number };
    if (!json.ok) {
      console.error(`Telegram ${method}:`, json.error_code, json.description);
      return null;
    }
    return json.result ?? null;
  } catch (err) {
    if ((err as Error).name !== "AbortError") console.error(`Telegram ${method} falló:`, (err as Error).message);
    return null;
  }
}

/** Envía un mensaje al chat configurado. Devuelve el message_id (o null si no se pudo enviar). */
export async function notify(text: string, keyboard?: Keyboard, chatId = config.telegramChatId): Promise<number | null> {
  if (!config.telegramToken || !chatId) return null;
  const result = await tg<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
  return result?.message_id ?? null;
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
