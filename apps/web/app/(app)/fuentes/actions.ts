"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { dbRow, dbRows } from "@/lib/db";
import { buildDenueSource } from "@/lib/denue";

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

// 5 campos de cron: min hora día mes día-semana
const CRON_RE = /^(\S+\s+){4}\S+$/;

function parse(fd: FormData) {
  const cron = text(fd, "cron");
  if (cron && !CRON_RE.test(cron)) throw new Error("El cron debe tener 5 campos, por ejemplo: 0 9 * * *");

  let config: Record<string, unknown> = {};
  const raw = text(fd, "config");
  if (raw) {
    try {
      config = JSON.parse(raw);
    } catch {
      throw new Error("La configuración no es un JSON válido");
    }
  }

  const kind = text(fd, "kind") ?? "api";
  if (!["api", "web", "csv", "manual"].includes(kind)) throw new Error("Tipo inválido");

  return {
    name: text(fd, "name") ?? "Fuente sin nombre",
    kind,
    url: text(fd, "url"),
    cron,
    config,
    scraping_allowed: fd.get("scraping_allowed") === "on",
  };
}

export async function createSource(formData: FormData) {
  await requireUser();
  let fields;
  try {
    fields = parse(formData);
  } catch (e) {
    redirect(`/fuentes?error=${encodeURIComponent(e instanceof Error ? e.message : "Datos inválidos")}`);
  }
  const { error } = await dbRows(
    "insert into sources (name, kind, url, cron, config, scraping_allowed, enabled) values ($1, $2, $3, $4, $5::jsonb, $6, true)",
    [fields.name, fields.kind, fields.url, fields.cron, JSON.stringify(fields.config), fields.scraping_allowed]
  );
  if (error) redirect(`/fuentes?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/fuentes");
  redirect("/fuentes");
}

export async function updateSource(id: string, formData: FormData) {
  await requireUser();
  let fields;
  try {
    fields = parse(formData);
  } catch (e) {
    redirect(`/fuentes?error=${encodeURIComponent(e instanceof Error ? e.message : "Datos inválidos")}`);
  }
  const { error } = await dbRows(
    "update sources set name = $1, kind = $2, url = $3, cron = $4, config = $5::jsonb, scraping_allowed = $6 where id = $7",
    [fields.name, fields.kind, fields.url, fields.cron, JSON.stringify(fields.config), fields.scraping_allowed, id]
  );
  if (error) redirect(`/fuentes?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/fuentes");
  redirect("/fuentes");
}

export async function toggleSource(id: string, enabled: boolean) {
  await requireUser();
  const { error } = await dbRows("update sources set enabled = $1 where id = $2", [enabled, id]);
  if (error) throw new Error(error.message);
  revalidatePath("/fuentes");
}

/** El worker revisa `run_requested_at` cada ~20 s y encola la ejecución. */
export async function runSourceNow(id: string) {
  await requireUser();
  const { error } = await dbRows("update sources set run_requested_at = $1 where id = $2", [new Date().toISOString(), id]);
  if (error) throw new Error(error.message);
  revalidatePath("/fuentes");
}

export async function deleteSource(id: string) {
  await requireUser();
  const { error } = await dbRows("delete from sources where id = $1", [id]);
  if (error) throw new Error(error.message);
  revalidatePath("/fuentes");
}

/** Asistente DENUE: arma la URL y la configuración a partir de giro, municipio y filtros. */
export async function createDenueSource(formData: FormData) {
  await requireUser();
  let source;
  try {
    source = buildDenueSource({
      giro: text(formData, "giro") ?? "",
      keyword: text(formData, "keyword") ?? "",
      municipio: text(formData, "municipio") ?? "",
      onlyNoWebsite: formData.get("only_no_website") === "on",
      onlyContactable: formData.get("only_contactable") === "on",
      pageSize: Number(text(formData, "page_size") ?? 50),
      cron: text(formData, "cron") ?? "0 9 * * *",
    });
  } catch (e) {
    redirect(`/fuentes?error=${encodeURIComponent(e instanceof Error ? e.message : "Datos inválidos")}`);
  }
  const { error } = await dbRows("insert into sources (name, kind, url, cron, config, enabled) values ($1, 'api', $2, $3, $4::jsonb, true)", [
    source.name,
    source.url,
    source.cron,
    JSON.stringify(source.config),
  ]);
  if (error) redirect(`/fuentes?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/fuentes");
  redirect("/fuentes");
}

/** Vuelve a la primera página de resultados (útil tras cambiar los datos que se guardan de cada negocio). */
export async function resetCursor(id: string) {
  await requireUser();
  const { data } = await dbRow<{ config: Record<string, unknown> }>("select config from sources where id = $1", [id]);
  const config = { ...((data?.config as Record<string, unknown>) ?? {}), cursor: 0 };
  const { error } = await dbRows("update sources set config = $1::jsonb where id = $2", [JSON.stringify(config), id]);
  if (error) throw new Error(error.message);
  revalidatePath("/fuentes");
}
