import { config } from "./config.js";

/** Fecha de hoy (AAAA-MM-DD) en la zona horaria configurada. */
export const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone }).format(new Date());

export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "2026-11-06" -> "6 nov" */
export const dayLabel = (key: string) =>
  new Intl.DateTimeFormat("es", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`));

export const greeting = () => {
  const hour = Number(new Intl.DateTimeFormat("es", { hour: "numeric", hour12: false, timeZone: config.timezone }).format(new Date()));
  return hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
};
