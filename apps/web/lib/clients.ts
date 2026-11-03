import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_MILESTONES = [
  "Kickoff y requerimientos",
  "Diseño aprobado",
  "Desarrollo",
  "Pruebas y ajustes",
  "Entrega y capacitación",
];

/** Crea un proyecto con la lista de hitos por defecto. Devuelve el id o null si falla. */
export async function createProjectWithMilestones(
  supabase: SupabaseClient,
  input: { client_id: string; name: string; budget?: number | null; currency?: string; start_date?: string | null; due_date?: string | null }
) {
  const { data: project, error } = await supabase
    .from("projects")
    .insert({ currency: "USD", ...input })
    .select("id")
    .single();
  if (error || !project) return null;

  await supabase
    .from("project_milestones")
    .insert(DEFAULT_MILESTONES.map((title, position) => ({ project_id: project.id, title, position })));
  return project.id as string;
}

/**
 * Cuando un prospecto se gana: crea (una sola vez) el cliente y su primer proyecto.
 * Si la migración 0003 aún no está aplicada, no hace nada.
 */
export async function ensureClientFromLead(supabase: SupabaseClient, leadId: string) {
  const { data: existing, error: findError } = await supabase.from("clients").select("id").eq("lead_id", leadId).maybeSingle();
  if (findError || existing) return existing?.id ?? null;

  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!lead) return null;

  const { data: client, error } = await supabase
    .from("clients")
    .insert({
      lead_id: lead.id,
      name: lead.name,
      company: lead.company,
      email: lead.email,
      phone: lead.phone,
      website: lead.website,
      notes: lead.notes,
    })
    .select("id")
    .single();
  if (error || !client) return null;

  await createProjectWithMilestones(supabase, {
    client_id: client.id,
    name: `Proyecto ${lead.company ?? lead.name}`,
    budget: lead.deal_value,
  });
  return client.id as string;
}
