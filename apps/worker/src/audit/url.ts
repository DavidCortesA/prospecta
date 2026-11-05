// Sin dependencias de Node: se usa también desde el Worker de Cloudflare (apps/bot).

/** Agrega https:// si falta y limpia lo que suele venir sucio en DENUE ("WWW.SITIO.COM", espacios). */
export function normalizeWebsite(raw: string | null | undefined): string | null {
  let v = (raw ?? "").trim();
  if (!v) return null;
  v = v.split(/\s+/)[0];
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    u.hostname = u.hostname.toLowerCase();
    return u.toString();
  } catch {
    return null;
  }
}
