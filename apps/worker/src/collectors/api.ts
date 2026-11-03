import type { LeadInput, Source } from "../db.js";
import { config } from "../config.js";

/**
 * Colector para APIs JSON. `source.config` define cómo mapear la respuesta:
 * { "itemsPath": "results", "map": { "name": "title", "email": "contact.email" } }
 */
export async function collectApi(source: Source): Promise<LeadInput[]> {
  if (!source.url) throw new Error("La fuente API no tiene URL");

  const headers = {
    "user-agent": config.userAgent,
    ...((source.config.headers as Record<string, string> | undefined) ?? {}),
  };
  const res = await fetch(source.url, { headers });
  if (!res.ok) throw new Error(`La API respondió ${res.status}`);

  const body = await res.json();
  const items = get(body, source.config.itemsPath as string | undefined);
  if (!Array.isArray(items)) throw new Error("itemsPath no apunta a un arreglo");

  const map = (source.config.map ?? {}) as Record<string, string>;
  return items
    .map((item): LeadInput => ({
      name: String(get(item, map.name) ?? ""),
      company: str(get(item, map.company)),
      email: str(get(item, map.email)),
      phone: str(get(item, map.phone)),
      website: str(get(item, map.website)),
      city: str(get(item, map.city)),
      raw: item as Record<string, unknown>,
    }))
    .filter((l) => l.name);
}

function get(obj: unknown, path?: string): unknown {
  if (!path) return obj;
  return path.split(".").reduce<unknown>((acc, key) => (acc as any)?.[key], obj);
}

const str = (v: unknown) => (v == null || v === "" ? null : String(v));
