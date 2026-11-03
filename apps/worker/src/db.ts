import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

export const db = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false },
});

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
