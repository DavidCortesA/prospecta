import { APP_TZ } from "./constants";

export const money = (n: number | null | undefined, currency = "USD") =>
  new Intl.NumberFormat("es", { style: "currency", currency, maximumFractionDigits: 2 }).format(n ?? 0);

export const dateShort = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: APP_TZ }).format(new Date(iso)) : "—";

export const dateTime = (iso?: string | null) =>
  iso
    ? new Intl.DateTimeFormat("es", { dateStyle: "short", timeStyle: "short", timeZone: APP_TZ }).format(new Date(iso))
    : "—";

export function timeAgo(iso?: string | null): string {
  if (!iso) return "nunca";
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "hace un momento";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} d`;
  return dateShort(iso);
}

export const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

/** "david.cortez@x.com" -> "David" */
export function firstName(email?: string | null, fullName?: string | null): string {
  const raw = fullName?.trim().split(/\s+/)[0] || email?.split("@")[0].split(/[._+-]/)[0] || "";
  return raw ? raw[0].toUpperCase() + raw.slice(1).toLowerCase() : "";
}

export function greeting(date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("es", { hour: "numeric", hour12: false, timeZone: APP_TZ }).format(date)
  );
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}
