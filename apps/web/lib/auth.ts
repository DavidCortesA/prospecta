import { createClient } from "@/lib/server";
import { query } from "@/lib/db";

/**
 * Sesión válida Y usuario autorizado (está en public.app_users). Devuelve null si no lo es.
 * El login sigue en Supabase Auth; la autorización de datos vive en Neon.
 */
export async function getAppUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return null;

  const { rowCount } = await query("select 1 from public.app_users where user_id = $1", [sub]);
  return rowCount ? data.claims : null;
}

/**
 * Las Server Actions se pueden invocar con un POST directo, así que cada una
 * debe verificar la sesión por sí misma (el proxy no basta).
 */
export async function requireUser() {
  const user = await getAppUser();
  if (!user) throw new Error("No autorizado");
  return { user };
}
