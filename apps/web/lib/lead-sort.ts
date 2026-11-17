import { LEAD_STATUSES } from "@/lib/constants";

// Orden de la tabla de prospectos. Todo lo que llega del navegador pasa por una lista blanca: el SQL se arma solo con
// expresiones fijas de este archivo, nunca con texto de la URL.

export type SortKey = "name" | "source" | "status" | "score" | "followup" | "created";
export type SortDir = "asc" | "desc";

export const SORT_KEYS: readonly SortKey[] = ["name", "source", "status", "score", "followup", "created"];
export const DEFAULT_SORT: { key: SortKey; dir: SortDir } = { key: "created", dir: "desc" };

/** Dirección del primer clic en la columna: textos de A a Z, fechas próximas primero, números de mayor a menor. */
export const FIRST_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  source: "asc",
  status: "asc",
  score: "desc",
  followup: "asc",
  created: "desc",
};

/** Texto de ayuda de cada dirección (tooltip del encabezado). */
export const SORT_HINT: Record<SortKey, Record<SortDir, string>> = {
  name: { asc: "A → Z", desc: "Z → A" },
  source: { asc: "A → Z", desc: "Z → A" },
  status: { asc: "Etapa inicial primero", desc: "Etapa final primero" },
  score: { asc: "Menor a mayor", desc: "Mayor a menor" },
  followup: { asc: "Más próximo primero", desc: "Más lejano primero" },
  created: { asc: "Más antiguo primero", desc: "Más reciente primero" },
};

export function parseSort(sort: unknown, dir: unknown): { key: SortKey; dir: SortDir } {
  const key = SORT_KEYS.find((k) => k === sort);
  if (!key) return DEFAULT_SORT;
  return { key, dir: dir === "asc" || dir === "desc" ? dir : FIRST_DIR[key] };
}

const STATUS_RANK = `array_position(array[${LEAD_STATUSES.map((s) => `'${s}'`).join(",")}]::text[], status)`;

// Minúsculas y sin acentos, para que "Óptica" se ordene entre la N y la P sin depender del idioma de la base de datos.
// Se traduce antes de bajar a minúsculas porque en algunas configuraciones lower() no toca las mayúsculas acentuadas.
const plain = (expr: string) =>
  `lower(translate(${expr}, 'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛáàäâéèëêíìïîóòöôúùüû', 'AAAAEEEEIIIIOOOOUUUUaaaaeeeeiiiioooouuuu'))`;

const EXPRESSION: Record<SortKey, string> = {
  name: plain("name"),
  source: plain("coalesce((select s.name from sources s where s.id = leads.source_id), 'Manual')"),
  status: STATUS_RANK, // nuevo → contactado → respondió → calificado → ganado → perdido
  score: "score",
  followup: "next_followup",
  created: "created_at",
};

/** Cláusula `order by` lista para pegar al final de la consulta. Los vacíos (p. ej. sin seguimiento) siempre al final. */
export function orderBySql(key: SortKey, dir: SortDir): string {
  const direction = dir === "asc" ? "asc" : "desc";
  return `order by ${EXPRESSION[key]} ${direction} nulls last, created_at desc, id`;
}
