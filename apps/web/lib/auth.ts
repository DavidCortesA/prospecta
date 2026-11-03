import { createClient } from "@/lib/server";

/**
 * Las Server Actions se pueden invocar con un POST directo, así que cada una
 * debe verificar la sesión por sí misma (el proxy no basta).
 */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) throw new Error("No autorizado");
  return { supabase, user: data.claims };
}
