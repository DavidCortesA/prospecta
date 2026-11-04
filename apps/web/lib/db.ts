import { attachDatabasePool } from "@vercel/functions";
import { Pool, types, type QueryResultRow } from "pg";

// Mismos tipos que devolvía PostgREST: numeric como número, date como "YYYY-MM-DD", timestamptz como ISO.
types.setTypeParser(1700, (v) => Number(v));
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1184, (v) => new Date(v).toISOString());

// Un pool por proceso. En desarrollo se reutiliza entre recargas en caliente para no abrir conexiones de más.
const globalForDb = globalThis as unknown as { dbPool?: Pool };

function createPool() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  // Vercel Fluid compute: cierra el pool cuando termina la instancia
  attachDatabasePool(pool);
  return pool;
}

export const pool = globalForDb.dbPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.dbPool = pool;

/** Ejecuta una consulta parametrizada. Los errores de Postgres traen `code` (p. ej. "23505" = duplicado). */
export function query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
  return pool.query<T>(text, values);
}

export type DbError = { code?: string; message: string };

/** Como el cliente anterior: devuelve { data, error } en vez de lanzar. `data` es null si hubo error. */
// `any` por defecto: el cliente de Supabase sin tipos generados también devolvía filas sin tipar.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dbRows<T extends QueryResultRow = any>(text: string, values?: unknown[]) {
  try {
    const { rows } = await query<T>(text, values);
    return { data: rows, error: null };
  } catch (error) {
    return { data: null, error: error as DbError };
  }
}

/** Como .maybeSingle()/.single(): la primera fila o null. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dbRow<T extends QueryResultRow = any>(text: string, values?: unknown[]) {
  const { data, error } = await dbRows<T>(text, values);
  return { data: data?.[0] ?? null, error };
}
