import { after } from "next/server";
import { handleInbound } from "@/lib/whatsapp/handler";
import { parseInbound, verifySignature } from "@/lib/whatsapp/kapso";

/**
 * Webhook de Kapso (evento whatsapp.message.received). Es público, así que TODO se valida con la firma:
 * sin KAPSO_WEBHOOK_SECRET configurado o con firma inválida responde 401 y no toca la base de datos.
 * Responde 200 enseguida (Kapso exige < 10 s) y la respuesta con IA se procesa después.
 */
export async function POST(request: Request) {
  const secret = process.env.KAPSO_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook sin configurar", { status: 503 });

  const raw = await request.text(); // el cuerpo exacto: la firma se calcula sobre estos bytes
  if (!verifySignature(raw, request.headers.get("x-webhook-signature"), secret)) {
    return new Response("Firma inválida", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  // Solo mensajes recibidos; otros eventos (enviado, entregado, leído...) se reconocen sin hacer nada
  const event = request.headers.get("x-webhook-event");
  if (event && event !== "whatsapp.message.received") return new Response("ok");

  const byPhone = new Map<string, ReturnType<typeof parseInbound>>();
  for (const m of parseInbound(body)) byPhone.set(m.from, [...(byPhone.get(m.from) ?? []), m]);

  after(async () => {
    for (const group of byPhone.values()) {
      try {
        await handleInbound(group);
      } catch (e) {
        console.error("WhatsApp: error procesando mensajes", e);
      }
    }
  });
  return new Response("ok");
}
