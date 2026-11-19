import { createHmac, timingSafeEqual } from "node:crypto";

/** Verifica `X-Webhook-Signature`: HMAC-SHA256 (hex) del cuerpo EXACTO recibido, con el secreto del webhook. */
export function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type InboundMessage = {
  phoneNumberId: string;
  from: string; // solo dígitos
  contactName: string | null;
  messageId: string;
  type: string;
  text: string | null;
};

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * Lee el payload v2 de `whatsapp.message.received`. Acepta también el envoltorio de lote
 * ({ batch: true, data: [...] }). Ignora lo que no sea un mensaje entrante de un cliente.
 */
export function parseInbound(body: unknown): InboundMessage[] {
  const root = obj(body);
  if (!root) return [];
  const items: unknown[] = root.batch === true && Array.isArray(root.data) ? root.data : [root];
  const out: InboundMessage[] = [];
  for (const item of items) {
    const it = obj(item);
    const message = obj(it?.message);
    const conversation = obj(it?.conversation);
    if (!it || !message) continue;
    const kapso = obj(message.kapso);
    if (kapso?.direction && kapso.direction !== "inbound") continue;
    const from = str(message.from)?.replace(/\D/g, "");
    const id = str(message.id);
    if (!from || !id) continue;
    out.push({
      phoneNumberId: str(it.phone_number_id) ?? str(conversation?.phone_number_id) ?? "",
      from,
      contactName: str(conversation?.contact_name),
      messageId: id,
      type: str(message.type) ?? "unknown",
      text: str(obj(message.text)?.body),
    });
  }
  return out;
}

/** Envía un texto por la API de Kapso. Solo funciona dentro de la ventana de 24 h del cliente. */
export async function sendText(phoneNumberId: string, to: string, text: string): Promise<void> {
  const apiKey = process.env.KAPSO_API_KEY;
  if (!apiKey) throw new Error("Falta KAPSO_API_KEY");
  const res = await fetch(`https://api.kapso.ai/meta/whatsapp/v24.0/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Kapso respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
}
