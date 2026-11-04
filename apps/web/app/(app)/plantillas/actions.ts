"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { dbRows } from "@/lib/db";

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
  await requireUser();
  const f = fields(formData);
  if (!f.body) redirect(`/plantillas?error=${encodeURIComponent("Escribe el mensaje")}`);
  const { error } = await dbRows("insert into message_templates (name, channel, subject, body) values ($1, $2, $3, $4)", [f.name, f.channel, f.subject, f.body]);
  if (error) redirect(`/plantillas?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/plantillas");
  redirect("/plantillas");
}

export async function updateTemplate(id: string, formData: FormData) {
  await requireUser();
  const f = fields(formData);
  if (!f.body) redirect(`/plantillas?error=${encodeURIComponent("Escribe el mensaje")}`);
  const { error } = await dbRows("update message_templates set name = $1, channel = $2, subject = $3, body = $4 where id = $5", [f.name, f.channel, f.subject, f.body, id]);
  if (error) redirect(`/plantillas?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/plantillas");
  redirect("/plantillas");
}

export async function setDefaultTemplate(id: string, channel: string) {
  await requireUser();
  // El índice único permite un solo "por defecto" por canal: primero se quita el anterior.
  await dbRows("update message_templates set is_default = false where channel = $1", [channel]);
  const { error } = await dbRows("update message_templates set is_default = true, active = true where id = $1", [id]);
  if (error) throw new Error(error.message);
  revalidatePath("/plantillas");
}

export async function toggleTemplate(id: string, active: boolean) {
  await requireUser();
  const { error } = await dbRows(
    "update message_templates set active = $1, is_default = case when $1::boolean then is_default else false end where id = $2",
    [active, id]
  );
  if (error) throw new Error(error.message);
  revalidatePath("/plantillas");
}

export async function deleteTemplate(id: string) {
  await requireUser();
  const { error } = await dbRows("delete from message_templates where id = $1", [id]);
  if (error) throw new Error(error.message);
  revalidatePath("/plantillas");
}
