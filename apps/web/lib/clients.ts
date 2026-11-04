import { dbRow, dbRows } from "@/lib/db";

export const DEFAULT_MILESTONES = [
  "Kickoff y requerimientos",
  "Diseño aprobado",
  "Desarrollo",
  "Pruebas y ajustes",
  "Entrega y capacitación",
];

/** Crea un proyecto con la lista de hitos por defecto. Devuelve el id o null si falla. */
export async function createProjectWithMilestones(input: {
  client_id: string;
  name: string;
  budget?: number | null;
  start_date?: string | null;
  due_date?: string | null;
}) {
  const { data: project, error } = await dbRow<{ id: string }>(
    "insert into projects (client_id, name, budget, start_date, due_date, currency) values ($1, $2, $3, $4, $5, 'MXN') returning id",
    [input.client_id, input.name, input.budget ?? null, input.start_date ?? null, input.due_date ?? null]
  );
  if (error || !project) return null;

  await dbRows(
    "insert into project_milestones (project_id, title, position) select $1::uuid, m.title, m.ord - 1 from unnest($2::text[]) with ordinality as m(title, ord)",
    [project.id, DEFAULT_MILESTONES]
  );
  return project.id;
}

/**
 * Cuando un prospecto se gana: crea (una sola vez) el cliente y su primer proyecto.
 * Si la migración 0003 aún no está aplicada, no hace nada.
 */
export async function ensureClientFromLead(leadId: string) {
  const { data: existing, error: findError } = await dbRow<{ id: string }>("select id from clients where lead_id = $1", [leadId]);
  if (findError || existing) return existing?.id ?? null;

  const { data: lead } = await dbRow<{
    id: string;
    name: string;
    company: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    notes: string | null;
    deal_value: number | null;
  }>("select * from leads where id = $1", [leadId]);
  if (!lead) return null;

  const { data: client, error } = await dbRow<{ id: string }>(
    "insert into clients (lead_id, name, company, email, phone, website, notes) values ($1, $2, $3, $4, $5, $6, $7) returning id",
    [lead.id, lead.name, lead.company, lead.email, lead.phone, lead.website, lead.notes]
  );
  if (error || !client) return null;

  await createProjectWithMilestones({
    client_id: client.id,
    name: `Proyecto ${lead.company ?? lead.name}`,
    budget: lead.deal_value,
  });
  return client.id;
}
