"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

function fields(fd: FormData) {
  const channel = text(fd, "channel") === "email" ? "email" : "whatsapp";
  return {
    name: text(fd, "name") ?? "Plantilla",
    channel,
    subject: channel === "email" ? text(fd, "subject") : null,
    body: text(fd, "body") ?? "",
  };
}

export async function createTemplate(formData: FormData) {
  const { supabase } = await requireUser();
  const f = fields(formData);
  if (!f.body) redirect(`/plantillas?error=${encodeURIComponent("Escribe el mensaje")}`);
  const { error } = await supabase.from("message_templates").insert(f);
  if (error) redirect(`/plantillas?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/plantillas");
  redirect("/plantillas");
}

export async function updateTemplate(id: string, formData: FormData) {
  const { supabase } = await requireUser();
  const f = fields(formData);
  if (!f.body) redirect(`/plantillas?error=${encodeURIComponent("Escribe el mensaje")}`);
  const { error } = await supabase.from("message_templates").update(f).eq("id", id);
  if (error) redirect(`/plantillas?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/plantillas");
  redirect("/plantillas");
}

export async function setDefaultTemplate(id: string, channel: string) {
  const { supabase } = await requireUser();
  // El índice único permite un solo "por defecto" por canal: primero se quita el anterior.
  await supabase.from("message_templates").update({ is_default: false }).eq("channel", channel);
  const { error } = await supabase.from("message_templates").update({ is_default: true, active: true }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/plantillas");
}

export async function toggleTemplate(id: string, active: boolean) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("message_templates").update({ active, ...(active ? {} : { is_default: false }) }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/plantillas");
}

export async function deleteTemplate(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("message_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/plantillas");
}
