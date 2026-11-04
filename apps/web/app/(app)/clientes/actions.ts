"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { dbRow, dbRows } from "@/lib/db";
import { createProjectWithMilestones } from "@/lib/clients";
import { PROJECT_STATUSES } from "@/lib/constants";

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
const num = (fd: FormData, key: string) => {
  const v = text(fd, key);
  const n = v === null ? NaN : Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

const clientFields = (fd: FormData) => ({
  name: text(fd, "name") ?? "Sin nombre",
  company: text(fd, "company"),
  email: text(fd, "email")?.toLowerCase() ?? null,
  phone: text(fd, "phone"),
  website: text(fd, "website"),
  notes: text(fd, "notes"),
});

export async function createCustomer(formData: FormData) {
  await requireUser();
  const f = clientFields(formData);
  const { data, error } = await dbRow<{ id: string }>(
    "insert into clients (name, company, email, phone, website, notes) values ($1, $2, $3, $4, $5, $6) returning id",
    [f.name, f.company, f.email, f.phone, f.website, f.notes]
  );
  if (error) redirect(`/clientes?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/clientes");
  redirect(`/clientes/${data!.id}`);
}

export async function updateCustomer(id: string, formData: FormData) {
  await requireUser();
  const f = clientFields(formData);
  const { error } = await dbRows("update clients set name = $1, company = $2, email = $3, phone = $4, website = $5, notes = $6 where id = $7", [
    f.name,
    f.company,
    f.email,
    f.phone,
    f.website,
    f.notes,
    id,
  ]);
  if (error) throw new Error(error.message);
  revalidatePath(`/clientes/${id}`);
}

export async function deleteCustomer(id: string) {
  await requireUser();
  const { error } = await dbRows("delete from clients where id = $1", [id]);
  if (error) throw new Error(error.message);
  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function createProject(clientId: string, formData: FormData) {
  await requireUser();
  const id = await createProjectWithMilestones({
    client_id: clientId,
    name: text(formData, "name") ?? "Proyecto",
    budget: num(formData, "budget"),
    start_date: text(formData, "start_date"),
    due_date: text(formData, "due_date"),
  });
  if (!id) throw new Error("No se pudo crear el proyecto");
  revalidatePath(`/clientes/${clientId}`);
}

export async function updateProject(projectId: string, clientId: string, formData: FormData) {
  await requireUser();
  const status = text(formData, "status") ?? "onboarding";
  if (!(PROJECT_STATUSES as readonly string[]).includes(status)) throw new Error("Estado inválido");
  const { error } = await dbRows(
    "update projects set name = $1, status = $2, budget = $3, start_date = $4, due_date = $5, notes = $6 where id = $7",
    [text(formData, "name") ?? "Proyecto", status, num(formData, "budget"), text(formData, "start_date"), text(formData, "due_date"), text(formData, "notes"), projectId]
  );
  if (error) throw new Error(error.message);
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
}

export async function deleteProject(projectId: string, clientId: string) {
  await requireUser();
  const { error } = await dbRows("delete from projects where id = $1", [projectId]);
  if (error) throw new Error(error.message);
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
}

export async function toggleMilestone(milestoneId: string, clientId: string, done: boolean) {
  await requireUser();
  const { error } = await dbRows("update project_milestones set done = $1 where id = $2", [done, milestoneId]);
  if (error) throw new Error(error.message);
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
}

export async function addMilestone(projectId: string, clientId: string, formData: FormData) {
  await requireUser();
  const title = text(formData, "title");
  if (!title) return;
  const { data: last } = await dbRow<{ position: number }>(
    "select position from project_milestones where project_id = $1 order by position desc limit 1",
    [projectId]
  );
  const { error } = await dbRows("insert into project_milestones (project_id, title, position) values ($1, $2, $3)", [
    projectId,
    title,
    (last?.position ?? -1) + 1,
  ]);
  if (error) throw new Error(error.message);
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
}

export async function deleteMilestone(milestoneId: string, clientId: string) {
  await requireUser();
  const { error } = await dbRows("delete from project_milestones where id = $1", [milestoneId]);
  if (error) throw new Error(error.message);
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
}
