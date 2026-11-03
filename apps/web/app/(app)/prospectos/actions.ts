"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/constants";
import { ensureClientFromLead } from "@/lib/clients";
import { addDays, todayKey } from "@/lib/format";

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
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("leads").insert(leadFields(formData)).select("id").single();
  if (error) {
    const dup = error.code === "23505" ? "Ya existe un prospecto con ese correo o sitio web" : error.message;
    redirect(`/prospectos/nuevo?error=${encodeURIComponent(dup)}`);
  }
  revalidatePath("/prospectos");
  redirect(`/prospectos/${data.id}`);
}

export async function updateLead(id: string, formData: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("leads")
    .update({ ...leadFields(formData), deal_value: num(formData, "deal_value") })
    .eq("id", id);
  if (error) redirect(`/prospectos/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/prospectos/${id}`);
  revalidatePath("/prospectos");
}

/** Cambia el estado. Ganar acepta valor del trato; perder acepta motivo. */
export async function setLeadStatus(id: string, status: LeadStatus, extra?: { dealValue?: number | null; lostReason?: string | null }) {
  const { supabase } = await requireUser();
  if (!LEAD_STATUSES.includes(status)) throw new Error("Estado inválido");

  const patch: Record<string, unknown> = { status };
  if (status === "won" && extra?.dealValue != null) patch.deal_value = extra.dealValue;
  if (status === "lost") patch.lost_reason = extra?.lostReason ?? null;
  if (status !== "lost") patch.lost_reason = null;

  const { error } = await supabase.from("leads").update(patch).eq("id", id);
  if (error) throw new Error(error.message);

  if (status === "won") await ensureClientFromLead(supabase, id);

  revalidatePath("/", "layout");
}

export async function changeStatusForm(id: string, status: LeadStatus, formData: FormData) {
  await setLeadStatus(id, status, {
    dealValue: num(formData, "deal_value"),
    lostReason: text(formData, "lost_reason"),
  });
}

export async function addNote(leadId: string, formData: FormData) {
  const { supabase } = await requireUser();
  const note = text(formData, "note");
  if (!note) return;
  const { error } = await supabase.from("lead_events").insert({ lead_id: leadId, type: "note", payload: { text: note } });
  if (error) throw new Error(error.message);
  revalidatePath(`/prospectos/${leadId}`);
}

export async function deleteLead(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  redirect("/prospectos");
}

/** Fija (o quita, con null) la fecha del próximo seguimiento. */
export async function setFollowup(id: string, date: string | null) {
  const { supabase } = await requireUser();
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Fecha inválida");
  const { error } = await supabase.from("leads").update({ next_followup: date }).eq("id", id);
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
  const { supabase } = await requireUser();
  await supabase.from("lead_events").insert({ lead_id: leadId, type: "contact", payload: { channel, template } });
  const { data: lead } = await supabase.from("leads").select("status").eq("id", leadId).maybeSingle();
  if (lead?.status === "new") await supabase.from("leads").update({ status: "contacted" }).eq("id", leadId);
  revalidatePath("/", "layout");
}
