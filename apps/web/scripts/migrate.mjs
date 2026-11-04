// Aplica en orden los archivos de db/migrations/ que aún no estén en la base. Se usa la conexión directa
// (DATABASE_URL_UNPOOLED) porque las migraciones no deben pasar por el pooler.
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../db/migrations");
const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Falta DATABASE_URL_UNPOOLED (o DATABASE_URL) en el entorno");

const client = new pg.Client({ connectionString });
await client.connect();

try {
  await client.query(`
    create table if not exists public.schema_migrations (
      filename   text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const applied = new Set((await client.query("select filename from public.schema_migrations")).rows.map((r) => r.filename));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`ya aplicada: ${file}`);
      continue;
    }
    const sql = await readFile(path.join(dir, file), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into public.schema_migrations (filename) values ($1)", [file]);
      await client.query("commit");
      console.log(`aplicada: ${file}`);
    } catch (err) {
      await client.query("rollback");
      throw new Error(`falló ${file}: ${err.message}`);
    }
  }
} finally {
  await client.end();
}
