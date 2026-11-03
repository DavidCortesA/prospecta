import type { CollectResult, LeadInput, Source } from "../db.js";
import { config } from "../config.js";

/**
 * Colector para APIs JSON. `source.config`:
 *  - itemsPath: ruta al arreglo dentro de la respuesta (vacío si la respuesta ya es un arreglo)
 *  - map: { name, company, email, phone, website, city, notes, external_id } -> rutas en cada item ("a.b.c")
 *  - filter: { requireAny: ["email","phone"], missing: ["website"] } sobre los campos ya mapeados
 *  - pageSize / cursor: paginación; la URL usa {{from}} y {{to}} y el cursor avanza solo en cada ejecución
 *  - headers: cabeceras extra
 *
 * La URL admite {{env.NOMBRE}} para leer secretos (tokens) de las variables de entorno del worker,
 * así no quedan guardados en la base de datos.
 */
export async function collectApi(source: Source): Promise<CollectResult> {
  if (!source.url) throw new Error("La fuente API no tiene URL");

  const pageSize = Math.max(1, Number(source.config.pageSize ?? 50));
  const cursor = Math.max(0, Number(source.config.cursor ?? 0));
  const paginated = source.url.includes("{{from}}");

  const url = fill(source.url, { from: cursor + 1, to: cursor + pageSize });
  const headers = {
    "user-agent": config.userAgent,
    ...((source.config.headers as Record<string, string> | undefined) ?? {}),
  };

  const res = await fetch(url, { headers });
  if (!res.ok) {
    // Pedir un rango más allá del final de los resultados: se reinicia desde el principio.
    if (paginated && cursor > 0 && (res.status === 404 || res.status === 400)) {
      return { leads: [], nextConfig: { cursor: 0 } };
    }
    throw new Error(`La API respondió ${res.status}`);
  }

  const body = await readJson(res);
  const items = get(body, source.config.itemsPath as string | undefined);
  if (!Array.isArray(items)) throw new Error("La respuesta no es un arreglo (revisa itemsPath)");

  const map = (source.config.map ?? {}) as Record<string, string>;
  const filter = (source.config.filter ?? {}) as { requireAny?: string[]; missing?: string[] };

  // Un campo que no está en `map` queda vacío (no se debe tomar el item completo).
  const field = (item: unknown, key: string) => (map[key] ? str(get(item, map[key])) : null);

  const leads = items
    .map(
      (item): LeadInput => ({
        name: field(item, "name") ?? "",
        company: field(item, "company"),
        email: field(item, "email")?.toLowerCase() ?? null,
        phone: field(item, "phone"),
        website: field(item, "website"),
        city: field(item, "city"),
        notes: field(item, "notes"),
        external_id: field(item, "external_id"),
        raw: item as Record<string, unknown>,
      })
    )
    .filter((l) => l.name)
    .filter((l) => !filter.requireAny?.length || filter.requireAny.some((f) => l[f as keyof LeadInput]))
    .filter((l) => !filter.missing?.length || filter.missing.every((f) => !l[f as keyof LeadInput]));

  // Si la página vino completa hay más resultados; si no, se terminó y se reinicia el cursor.
  const nextConfig = paginated ? { cursor: items.length >= pageSize ? cursor + pageSize : 0 } : undefined;
  return { leads, nextConfig };
}

function fill(template: string, vars: Record<string, number>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    if (key.startsWith("env.")) {
      const name = key.slice(4);
      const value = process.env[name];
      if (!value) throw new Error(`Falta la variable ${name} en el servicio del worker (Railway)`);
      return value;
    }
    if (key in vars) return String(vars[key]);
    throw new Error(`Variable desconocida en la URL: {{${key}}}`);
  });
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("La URL no devolvió JSON (¿es una página web y no una API?)");
  }
}

function get(obj: unknown, path?: string): unknown {
  if (!path) return obj;
  return path.split(".").reduce<unknown>((acc, key) => (acc as any)?.[key], obj);
}

const str = (v: unknown) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
};
