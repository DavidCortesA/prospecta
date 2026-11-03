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
  raw?: Record<string, unknown>;
};
