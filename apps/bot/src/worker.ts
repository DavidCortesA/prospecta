// Worker de Cloudflare: recibe los mensajes de Telegram por webhook y responde al instante.
// Reutiliza el bot de apps/worker/src (bot.ts y todo lo que usa); solo cambia cómo llegan los mensajes
// (webhook en vez de getUpdates) y cómo se conecta a Neon (driver HTTP en vez de `pg`, ver shims/pg.ts).
//
// Secretos del Worker (Settings → Variables and Secrets, sección "Runtime"):
//   DATABASE_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, WEBHOOK_SECRET
//   (opcionales) DASHBOARD_URL, BUSINESS_NAME, APP_TZ
//
// Los módulos del bot leen process.env al cargarse, por eso se importan de forma dinámica
// DESPUÉS de copiar los secretos del Worker a process.env.

import type { TgUpdate } from "../../worker/src/bot.js"; // solo tipo: no carga el bot

type Env = Record<string, unknown>;
type Ctx = { waitUntil(promise: Promise<unknown>): void };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

function loadEnv(env: Env) {
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string") process.env[k] = v;
  }
  // Acepta también el nombre TELEGRAM_TOKEN (el que usa chamba-bot)
  process.env.TELEGRAM_BOT_TOKEN ??= process.env.TELEGRAM_TOKEN;
}

/** Comparación en tiempo constante para no filtrar el secreto por tiempos de respuesta */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Llama a la Bot API y devuelve la respuesta completa (el token nunca sale en los mensajes). */
async function telegram(method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }))) as {
    ok: boolean;
    result?: unknown;
    description?: string;
  };
}

async function processUpdate(update: TgUpdate) {
  const { handleUpdate } = await import("../../worker/src/bot.js");
  try {
    await handleUpdate(update);
  } catch (err) {
    console.error("Error atendiendo update de Telegram:", err instanceof Error ? err.message : err);
    const { notify } = await import("../../worker/src/telegram.js");
    await notify("⚠️ Algo falló procesando eso. Intenta de nuevo.").catch(() => {});
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(request.url);
    const secret = typeof env.WEBHOOK_SECRET === "string" ? env.WEBHOOK_SECRET : "";

    // Salud: sirve para comprobar que el Worker está arriba
    if (request.method === "GET" && url.pathname === "/") {
      return new Response("Prospecta bot activo");
    }

    // Registro del webhook (se abre una vez en el navegador):
    //   /setup?key=<WEBHOOK_SECRET>            → conecta Telegram con este Worker y registra el menú
    //   /setup?key=<WEBHOOK_SECRET>&delete=1   → quita el webhook (para volver a TELEGRAM_POLLING=1)
    if (request.method === "GET" && url.pathname === "/setup") {
      if (!secret || !safeEqual(url.searchParams.get("key") ?? "", secret)) {
        return json({ ok: false, error: "key inválida" }, 401);
      }
      loadEnv(env);
      if (!process.env.TELEGRAM_BOT_TOKEN) {
        return json({ ok: false, error: "Falta TELEGRAM_BOT_TOKEN en las variables de runtime del Worker" }, 500);
      }

      if (url.searchParams.get("delete") === "1") {
        const res = await telegram("deleteWebhook", { drop_pending_updates: false });
        return json({ ok: res.ok, action: "webhook eliminado", telegram: res.description }, res.ok ? 200 : 502);
      }

      const target = `${url.origin}/webhook`;
      const hook = await telegram("setWebhook", {
        url: target,
        secret_token: secret,
        allowed_updates: ["message", "callback_query"],
        max_connections: 10,
        drop_pending_updates: false,
      });
      if (!hook.ok) return json({ ok: false, error: hook.description }, 502);

      const { BOT_COMMANDS } = await import("../../worker/src/bot.js");
      const commands = await telegram("setMyCommands", { commands: BOT_COMMANDS });
      return json({ ok: true, action: "webhook registrado", url: target, commands: commands.ok });
    }

    if (request.method === "POST" && url.pathname === "/webhook") {
      // Telegram manda el secreto que pasamos en setWebhook
      const header = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
      if (!secret || !safeEqual(header, secret)) return new Response("Unauthorized", { status: 401 });

      let update: TgUpdate;
      try {
        update = (await request.json()) as TgUpdate;
      } catch {
        return new Response("Bad request", { status: 400 });
      }

      loadEnv(env);
      // Respondemos 200 ya (Telegram reintenta si tardamos) y trabajamos en segundo plano
      ctx.waitUntil(processUpdate(update));
      return new Response("ok");
    }

    return new Response("Not found", { status: 404 });
  },
};
