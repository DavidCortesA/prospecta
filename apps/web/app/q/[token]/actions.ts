"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/server";

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
};

/**
 * Aceptación pública. No requiere sesión: la protege el token secreto del enlace y la lógica vive en la
 * función accept_public_quote de la base (vigencia, estado, una sola aceptación).
 */
export async function acceptQuote(token: string, formData: FormData) {
  const name = text(formData, "name");
  const comment = text(formData, "comment");
  const agreed = formData.get("agree") === "on";
  const back = `/q/${encodeURIComponent(token)}`;

  if (!agreed) redirect(`${back}?error=agree`);
  if (!name) redirect(`${back}?error=name_required`);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_public_quote", {
    p_token: token,
    p_name: name,
    p_comment: comment || null,
  });

  const result = data as { ok: boolean; error?: string } | null;
  if (error || !result) redirect(`${back}?error=unknown`);
  if (!result.ok) redirect(`${back}?error=${result.error ?? "unknown"}`);
  redirect(`${back}?accepted=1`);
}
