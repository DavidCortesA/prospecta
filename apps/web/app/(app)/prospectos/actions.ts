"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { dbRow, dbRows } from "@/lib/db";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/constants";
import { ensureClientFromLead } from "@/lib/clients";
import { addDays, todayKey } from "@/lib/format";
import { normalizeWebsite } from "@/lib/templates";

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

const num = (fd: FormData, key: string) => {
  const v = text(fd, key);
  if (v === null) return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

function leadFields(fd: FormData) {
  return {
    name: text(fd, "name") ?? "Sin nombre",
    company: text(fd, "company"),
    email: text(fd, "email")?.toLowerCase() ?? null,
    phone: text(fd, "phone"),
    website: text(fd, "website"),
    city: text(fd, "city"),
    notes: text(fd, "notes"),
    score: Math.min(100, Math.max(0, num(fd, "score") ?? 0)),
  };
}

export async function createLead(formData: FormData) {
  await requireUser();
  const f = leadFields(formData);
  const { data, error } = await dbRow<{ id: string }>(
    "insert into leads (name, company, email, phone, website, city, notes, score) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id",
    [f.name, f.company, f.email, f.phone, f.website, f.city, f.notes, f.score]
  );
  if (error) {
    const dup = error.code === "23505" ? "Ya existe un prospecto con ese correo o sitio web" : error.message;
    redirect(`/prospectos/nuevo?error=${encodeURIComponent(dup)}`);
  }
  revalidatePath("/prospectos");
  redirect(`/prospectos/${data!.id}`);
}

export async function updateLead(id: string, formData: FormData) {
  await requireUser();
  const f = leadFields(formData);
  const { error } = await dbRows(
    "update leads set name = $1, company = $2, email = $3, phone = $4, website = $5, city = $6, notes = $7, score = $8, deal_value = $9 where id = $10",
    [f.name, f.company, f.email, f.phone, f.website, f.city, f.notes, f.score, num(formData, "deal_value"), id]
  );
  if (error) redirect(`/prospectos/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/prospectos/${id}`);
  revalidatePath("/prospectos");
}

/** Cambia el estado. Ganar acepta valor del trato; perder acepta motivo. */
export async function setLeadStatus(id: string, status: LeadStatus, extra?: { dealValue?: number | null; lostReason?: string | null }) {
  await requireUser();
  if (!LEAD_STATUSES.includes(status)) throw new Error("Estado inválido");

  // deal_value solo cambia al ganar con valor; lost_reason se guarda al perder y se limpia en otro caso
  const dealValue = status === "won" && extra?.dealValue != null ? extra.dealValue : null;
  const lostReason = status === "lost" ? (extra?.lostReason ?? null) : null;

  const { error } = await dbRows(
    "update leads set status = $1, deal_value = coalesce($2::numeric, deal_value), lost_reason = $3 where id = $4",
    [status, dealValue, lostReason, id]
  );
  if (error) throw new Error(error.message);

  if (status === "won") await ensureClientFromLead(id);

  revalidatePath("/", "layout");
}

export async function changeStatusForm(id: string, status: LeadStatus, formData: FormData) {
  await setLeadStatus(id, status, {
    dealValue: num(formData, "deal_value"),
    lostReason: text(formData, "lost_reason"),
  });
}

export async function addNote(leadId: string, formData: FormData) {
  await requireUser();
  const note = text(formData, "note");
  if (!note) return;
  const { error } = await dbRows("insert into lead_events (lead_id, type, payload) values ($1, 'note', $2::jsonb)", [leadId, JSON.stringify({ text: note })]);
  if (error) throw new Error(error.message);
  revalidatePath(`/prospectos/${leadId}`);
}

export async function deleteLead(id: string) {
  await requireUser();
  const { error } = await dbRows("delete from leads where id = $1", [id]);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  redirect("/prospectos");
}

/** Fija (o quita, con null) la fecha del próximo seguimiento. */
export async function setFollowup(id: string, date: string | null) {
  await requireUser();
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Fecha inválida");
  const { error } = await dbRows("update leads set next_followup = $1 where id = $2", [date, id]);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function setFollowupForm(id: string, formData: FormData) {
  await setFollowup(id, text(formData, "date"));
}

/** Agenda el seguimiento dentro de N días a partir de hoy. */
export async function snoozeFollowup(id: string, days: number) {
  await setFollowup(id, addDays(todayKey(), days));
}

export async function clearFollowup(id: string) {
  await setFollowup(id, null);
}

/**
 * Registra que se abrió WhatsApp/correo con una plantilla. Si el prospecto estaba Nuevo, pasa a Contactado
 * (y el trigger de la base agenda el seguimiento en 3 días).
 */
export async function logContact(leadId: string, channel: "whatsapp" | "email", template: string) {
  await requireUser();
  await dbRows("insert into lead_events (lead_id, type, payload) values ($1, 'contact', $2::jsonb)", [leadId, JSON.stringify({ channel, template })]);
  const { data: lead } = await dbRow<{ status: string }>("select status from leads where id = $1", [leadId]);
  if (lead?.status === "new") await dbRows("update leads set status = 'contacted' where id = $1", [leadId]);
  revalidatePath("/", "layout");
}

/** Pide al bot que revise el sitio web del prospecto (el worker la toma en ~20 s). */
export async function requestSiteAudit(leadId: string) {
  await requireUser();
  const { data: lead } = await dbRow<{ website: string | null }>("select website from leads where id = $1", [leadId]);
  const url = normalizeWebsite(lead?.website);
  if (!url) redirect(`/prospectos/${leadId}?error=${encodeURIComponent("Este prospecto no tiene un sitio web válido")}`);

  const { data: open } = await dbRows("select id from site_audits where lead_id = $1 and status in ('pending', 'running') limit 1", [leadId]);
  if (!open?.length) {
    const { error } = await dbRows("insert into site_audits (lead_id, url) values ($1, $2)", [leadId, url]);
    if (error) redirect(`/prospectos/${leadId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/prospectos/${leadId}`);
}
