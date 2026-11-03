import { APP_TZ } from "./constants";

/** Todo el sistema trabaja en pesos mexicanos: $1,500.00 */
export const money = (n: number | null | undefined) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n ?? 0);

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Las fechas sin hora (columnas `date`: vigencia, inicio/entrega) se muestran tal cual, sin correrlas por la zona horaria. */
export const dateShort = (iso?: string | null) => {
  if (!iso) return "—";
  if (DATE_ONLY.test(iso)) {
    return new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
  }
  return new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: APP_TZ }).format(new Date(iso));
};

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

/** Fecha de hoy (AAAA-MM-DD) en la zona horaria de la app. */
export const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ }).format(new Date());

export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "2026-11-06" -> "6 nov" */
export const dayLabel = (key?: string | null) =>
  key ? new Intl.DateTimeFormat("es", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`)) : "—";

export type FollowupState = "overdue" | "today" | "later";
export function followupState(key: string, today = todayKey()): FollowupState {
  return key < today ? "overdue" : key === today ? "today" : "later";
}

/** Hora actual en ms. Se usa en componentes de servidor que ya leyeron datos de la petición (no se prerenderizan). */
export const nowMs = () => Date.now();
