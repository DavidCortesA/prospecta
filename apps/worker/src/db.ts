import { Pool, types, type QueryResultRow } from "pg";
import { config } from "./config.js";

export const pool = new Pool({ connectionString: config.databaseUrl, max: 5 });

// Las columnas `date` llegan como texto "AAAA-MM-DD" (como antes con PostgREST), no como Date de JS
types.setTypeParser(1082, (v: string) => v);

/** Ejecuta una consulta parametrizada. Los errores de Postgres traen `code` (p. ej. "23505" = duplicado). */
export function query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
  return pool.query<T>(text, values);
}

export type Source = {
  id: string;
  name: string;
  kind: "api" | "web" | "csv" | "manual";
  url: string | null;
  config: Record<string, unknown>;
  scraping_allowed: boolean;
  enabled: boolean;
  cron: string | null;
};

export type LeadInput = {
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  city?: string | null;
  notes?: string | null;
  score?: number;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  /** Id del registro en la fuente original (evita duplicados aunque no tenga correo ni sitio) */
  external_id?: string | null;
  raw?: Record<string, unknown>;
};

/** Lo que devuelve un colector: prospectos y, opcionalmente, cambios a guardar en `sources.config` (p. ej. el cursor de paginación). */
export type CollectResult = {
  leads: LeadInput[];
  nextConfig?: Record<string, unknown>;
};
