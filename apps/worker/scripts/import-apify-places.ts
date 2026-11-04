/**
 * Importa a `leads` los resultados de un dataset del Actor "compass/crawler-google-places" (Apify).
 *
 *   npm run import:apify -- <datasetId> [--dry-run] [--all] [--source "Nombre de la fuente"]
 *
 * - Lee APIFY_TOKEN de apps/worker/.env (nunca se imprime) y lo manda en la cabecera Authorization.
 * - Por defecto importa solo los negocios "ideales": con teléfono o correo, sin sitio web y abiertos.
 *   Con --all importa todos los abiertos con teléfono o correo.
 * - Evita duplicados por placeId (misma fuente) y por teléfono (contra los prospectos que ya tienes).
 * - No manda avisos de Telegram por prospecto: manda un solo resumen al final.
 */
import "dotenv/config";
import { query } from "../src/db.js";
import { notify } from "../src/telegram.js";

const args = process.argv.slice(2);
const datasetId = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const all = args.includes("--all");
const nameIdx = args.indexOf("--source");
const sourceName = nameIdx >= 0 ? args[nameIdx + 1] : "Google Maps (Apify)";

const token = (process.env.APIFY_TOKEN ?? "").trim();
if (!datasetId) throw new Error('Uso: npm run import:apify -- <datasetId> [--dry-run] [--all] [--source "Nombre"]');
if (!token) throw new Error("APIFY_TOKEN está vacío en apps/worker/.env");

type Place = {
  title?: string;
  categoryName?: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  phoneUnformatted?: string;
  phones?: string[];
  emails?: string[];
  website?: string;
  totalScore?: number;
  reviewsCount?: number;
  claimThisBusiness?: boolean;
  permanentlyClosed?: boolean;
  temporarilyClosed?: boolean;
  location?: { lat?: number; lng?: number };
  placeId?: string;
  url?: string;
  searchString?: string;
  scrapedAt?: string;
  facebooks?: string[];
  instagrams?: string[];
};

const has = (v: unknown) => !!(v && String(v).trim());
const last10 = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);

/** Teléfono mexicano en formato nacional de 10 dígitos (como DENUE); si no cuadra, se deja como viene. */
function phoneOf(p: Place): string | null {
  const raw = p.phoneUnformatted ?? p.phone ?? p.phones?.[0];
  if (!has(raw)) return null;
  const digits = String(raw).replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : String(raw).trim();
}

/** Score inicial: contactable (25) + sin web (30) + base (10) + tracción por reseñas + perfil sin reclamar. */
function score(p: Place, hasEmail: boolean): number {
  let s = 10 + 25 + (has(p.website) ? 0 : 30);
  if (hasEmail) s += 30;
  const r = p.reviewsCount ?? 0;
  s += r >= 200 ? 20 : r >= 50 ? 15 : r >= 10 ? 8 : r >= 1 ? 3 : 0;
  if (p.claimThisBusiness) s += 5;
  return Math.min(100, s);
}

// 1) Dataset
const res = await fetch(`https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?format=json&clean=true&limit=10000`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!res.ok) throw new Error(`Apify respondió ${res.status} al leer el dataset`);
const places = (await res.json()) as Place[];

// 2) Filtro
const candidates = places.filter((p) => {
  const open = !p.permanentlyClosed && !p.temporarilyClosed;
  const contactable = has(p.phone) || has(p.phoneUnformatted) || (p.phones ?? []).length > 0 || (p.emails ?? []).length > 0;
  return open && contactable && has(p.title) && has(p.placeId) && (all || !has(p.website));
});

// 3) Duplicados contra lo que ya existe (por teléfono)
const existing = await query<{ phone: string | null }>("SELECT phone FROM leads").then((r) => r.rows, () => []);
const knownPhones = new Set(existing.map((l) => last10(l.phone)).filter((p) => p.length === 10));
const seen = new Set<string>();
const fresh = candidates.filter((p) => {
  const ph = last10(phoneOf(p));
  if (ph.length === 10 && (knownPhones.has(ph) || seen.has(ph))) return false;
  if (ph.length === 10) seen.add(ph);
  return true;
});

console.log(`dataset: ${places.length} | candidatos (${all ? "todos con contacto" : "ideales"}): ${candidates.length} | nuevos tras quitar duplicados: ${fresh.length}`);
if (dryRun) {
  console.log("--dry-run: no se escribió nada");
  process.exit(0);
}
if (!fresh.length) process.exit(0);

// 4) Fuente (una por nombre)
// Como antes con maybeSingle: si hay más de una fuente con ese nombre, se trata como si no existiera
const found = await query<{ id: string }>("SELECT id FROM sources WHERE name = $1", [sourceName]).then((r) => r.rows, () => []);
let sourceId = found.length === 1 ? found[0].id : undefined;
if (!sourceId) {
  try {
    sourceId = (
      await query<{ id: string }>(
        "INSERT INTO sources (name, kind, cron, enabled, config) VALUES ($1, 'manual', NULL, true, $2::jsonb) RETURNING id", // importación puntual: el worker no la ejecuta
        [sourceName, JSON.stringify({ importedFrom: "apify:compass/crawler-google-places", datasetId })]
      )
    ).rows[0].id;
  } catch (err) {
    throw new Error(`No se pudo crear la fuente: ${(err as Error).message}`);
  }
}

// 5) Prospectos
const rows = fresh.map((p) => {
  const email = (p.emails ?? []).find(has)?.toLowerCase() ?? null;
  const town = (p.city ?? "").trim();
  return {
    source_id: sourceId,
    external_id: p.placeId!,
    name: p.title!.trim(),
    company: null,
    phone: phoneOf(p),
    email,
    website: has(p.website) ? p.website : null,
    // mismo formato que DENUE ("MONTERREY,Monterrey,NUEVO LEÓN") para que zonas y plantillas funcionen igual
    city: town ? [town.toUpperCase(), town, (p.state ?? "").toUpperCase()].filter(Boolean).join(",") : null,
    address: p.address?.replace(/,?\s*México$/i, "") ?? null,
    lat: p.location?.lat ?? null,
    lng: p.location?.lng ?? null,
    notes: p.categoryName ?? null,
    score: score(p, !!email),
    raw: {
      googleUrl: p.url,
      rating: p.totalScore,
      reviews: p.reviewsCount,
      unclaimedProfile: !!p.claimThisBusiness,
      searchString: p.searchString,
      scrapedAt: p.scrapedAt,
      facebooks: p.facebooks?.slice(0, 2),
      instagrams: p.instagrams?.slice(0, 2),
    },
  };
});

let inserted = 0;
let skipped = 0;
const insertedIds: { id: string; place: Place }[] = [];
const placeById = new Map(fresh.map((p) => [p.placeId!, p]));

// Inserta varios prospectos en una sola sentencia (columnas fijas; los valores van como parámetros)
const LEAD_COLS = ["source_id", "external_id", "name", "company", "phone", "email", "website", "city", "address", "lat", "lng", "notes", "score", "raw"];
function insertLeads(chunk: Record<string, unknown>[]) {
  const values = chunk.flatMap((r) => LEAD_COLS.map((c) => (c === "raw" ? JSON.stringify(r[c]) : r[c])));
  const marks = chunk.map((_, i) => `(${LEAD_COLS.map((c, j) => `$${i * LEAD_COLS.length + j + 1}${c === "raw" ? "::jsonb" : ""}`).join(", ")})`);
  return query<{ id: string; external_id: string }>(`INSERT INTO leads (${LEAD_COLS.join(", ")}) VALUES ${marks.join(", ")} RETURNING id, external_id`, values);
}

for (let i = 0; i < rows.length; i += 50) {
  const chunk = rows.slice(i, i + 50);
  const batch = await insertLeads(chunk).then((r) => r.rows, () => null);
  if (batch) {
    inserted += batch.length;
    for (const d of batch) insertedIds.push({ id: d.id, place: placeById.get(d.external_id)! });
    continue;
  }
  // Un duplicado (correo repetido, etc.) tumba el lote completo: se reintenta fila por fila.
  for (const row of chunk) {
    try {
      const [one] = (await insertLeads([row])).rows;
      inserted++;
      insertedIds.push({ id: one.id, place: placeById.get(one.external_id)! });
    } catch {
      skipped++;
    }
  }
}

// 6) Una nota en la bitácora con lo que aporta Google Maps (calificación, reseñas, perfil sin reclamar)
const notes = insertedIds.map(({ id, place }) => ({
  lead_id: id,
  payload: {
    via: "import-apify",
    text:
      `Google Maps: ${place.totalScore != null ? `${place.totalScore}★` : "sin calificación"} (${place.reviewsCount ?? 0} reseñas)` +
      `${place.claimThisBusiness ? " · perfil de Google sin reclamar" : ""} · búsqueda: ${place.searchString ?? "—"}`,
  },
}));
for (let i = 0; i < notes.length; i += 100) {
  const chunk = notes.slice(i, i + 100);
  // Si falla, la bitácora se omite (como antes, el error se ignoraba)
  await query(
    `INSERT INTO lead_events (lead_id, type, payload) VALUES ${chunk.map((_, j) => `($${j * 2 + 1}, 'note', $${j * 2 + 2}::jsonb)`).join(", ")}`,
    chunk.flatMap((n) => [n.lead_id, JSON.stringify(n.payload)])
  ).catch(() => {});
}

console.log(`importados: ${inserted} | omitidos por duplicado: ${skipped}`);
await notify(
  `📥 <b>Importación de Google Maps</b>\nAgregué <b>${inserted}</b> prospectos nuevos (con teléfono y sin sitio web) a la fuente «${sourceName}».\nEscribe /pendientes para ver los mejores o revisa el mapa.`
);
process.exit(0);
