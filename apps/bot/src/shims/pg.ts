// Sustituye a `pg` en el Worker de Cloudflare (ver "alias" en wrangler.jsonc).
// `pg` abre conexiones TCP persistentes, que no encajan con un Worker; el driver HTTP de Neon
// hace cada consulta como una petición fetch sin estado. Solo se implementa lo que usa
// apps/worker/src/db.ts: Pool#query, Pool#end y types.setTypeParser.
import { neon, types as neonTypes } from "@neondatabase/serverless";

export type QueryResultRow = Record<string, any>;

type Parser = (value: string) => unknown;
const overrides = new Map<number, Parser>();

/** Igual que `types` de pg: db.ts lo usa para que las columnas `date` lleguen como texto "AAAA-MM-DD". */
export const types = {
  setTypeParser(oid: number, parser: Parser) {
    overrides.set(oid, parser);
  },
};

// Los parsers propios mandan; el resto usa los de siempre (timestamp → Date, jsonb → objeto…)
const customTypes = {
  getTypeParser: (oid: number, format?: any) => overrides.get(oid) ?? (neonTypes as any).getTypeParser(oid, format),
} as any;

export class Pool {
  private sql;

  constructor(options: { connectionString: string; max?: number }) {
    this.sql = neon(options.connectionString);
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<{ rows: T[]; rowCount: number | null }> {
    // fullResults devuelve { rows, rowCount, … } como node-postgres
    const result = await this.sql.query(text, values as any[], { fullResults: true, types: customTypes });
    return { rows: result.rows as T[], rowCount: result.rowCount ?? null };
  }

  async end() {}
}
