"use server";

import { redirect } from "next/navigation";
import { dbRow } from "@/lib/db";

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

  const { data: row, error } = await dbRow<{ data: { ok: boolean; error?: string } | null }>(
    "select public.accept_public_quote($1, $2, $3) as data",
    [token, name, comment || null]
  );

  const result = row?.data ?? null;
  if (error || !result) redirect(`${back}?error=unknown`);
  if (!result.ok) redirect(`${back}?error=${result.error ?? "unknown"}`);
  redirect(`${back}?accepted=1`);
}
