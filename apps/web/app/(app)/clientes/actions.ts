"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
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
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("clients").insert(clientFields(formData)).select("id").single();
  if (error) redirect(`/clientes?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/clientes");
  redirect(`/clientes/${data.id}`);
}

export async function updateCustomer(id: string, formData: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("clients").update(clientFields(formData)).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/clientes/${id}`);
}

export async function deleteCustomer(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function createProject(clientId: string, formData: FormData) {
  const { supabase } = await requireUser();
  const id = await createProjectWithMilestones(supabase, {
    client_id: clientId,
    name: text(formData, "name") ?? "Proyecto",
    budget: num(formData, "budget"),
    currency: text(formData, "currency") ?? "USD",
    start_date: text(formData, "start_date"),
    due_date: text(formData, "due_date"),
  });
  if (!id) throw new Error("No se pudo crear el proyecto");
  revalidatePath(`/clientes/${clientId}`);
}

export async function updateProject(projectId: string, clientId: string, formData: FormData) {
  const { supabase } = await requireUser();
  const status = text(formData, "status") ?? "onboarding";
  if (!(PROJECT_STATUSES as readonly string[]).includes(status)) throw new Error("Estado inválido");
  const { error } = await supabase
    .from("projects")
    .update({
      name: text(formData, "name") ?? "Proyecto",
      status,
      budget: num(formData, "budget"),
      start_date: text(formData, "start_date"),
      due_date: text(formData, "due_date"),
      notes: text(formData, "notes"),
    })
    .eq("id", projectId);
  if (error) throw new Error(error.message);
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
}

export async function deleteProject(projectId: string, clientId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) throw new Error(error.message);
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
}

export async function toggleMilestone(milestoneId: string, clientId: string, done: boolean) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("project_milestones").update({ done }).eq("id", milestoneId);
  if (error) throw new Error(error.message);
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
}

export async function addMilestone(projectId: string, clientId: string, formData: FormData) {
  const { supabase } = await requireUser();
  const title = text(formData, "title");
  if (!title) return;
  const { data: last } = await supabase
    .from("project_milestones")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase
    .from("project_milestones")
    .insert({ project_id: projectId, title, position: (last?.position ?? -1) + 1 });
  if (error) throw new Error(error.message);
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
}

export async function deleteMilestone(milestoneId: string, clientId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("project_milestones").delete().eq("id", milestoneId);
  if (error) throw new Error(error.message);
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
}
