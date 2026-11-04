"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { dbRow, dbRows } from "@/lib/db";
import { QUOTE_STATUSES, type QuoteStatus } from "@/lib/constants";
import { calcTotals, type QuoteInput } from "@/lib/quotes";
import { setLeadStatus } from "../prospectos/actions";

const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
const money = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0);

export async function createQuote(input: QuoteInput) {
  await requireUser();

  const items = (input.items ?? [])
    .map((i, position) => ({
      feature_id: i.feature_id || null,
      name: clean(i.name) ?? "Concepto",
      description: clean(i.description),
      qty: Math.max(0.01, money(i.qty)),
      unit_price: Math.max(0, money(i.unit_price)),
      position,
    }))
    .filter((i) => i.name);
  if (!items.length) throw new Error("Agrega al menos un concepto a la cotización");

  const { data: quote, error } = await dbRow<{ id: string }>(
    `insert into quotes (title, lead_id, client_id, customer_name, customer_company, customer_email, currency, discount_pct, tax_pct, valid_until, notes)
     values ($1, $2, $3, $4, $5, $6, 'MXN', $7, $8, $9, $10) returning id`,
    [
      clean(input.title) ?? "Cotización",
      input.lead_id || null,
      input.client_id || null,
      clean(input.customer_name) ?? "Cliente",
      clean(input.customer_company),
      clean(input.customer_email),
      Math.min(100, Math.max(0, money(input.discount_pct))),
      Math.min(100, Math.max(0, money(input.tax_pct))),
      clean(input.valid_until),
      clean(input.notes),
    ]
  );
  if (error || !quote) throw new Error(error?.message ?? "No se pudo crear la cotización");

  // Todos los conceptos en una sola sentencia (se insertan completos o ninguno)
  const { error: itemsError } = await dbRows(
    `insert into quote_items (quote_id, feature_id, name, description, qty, unit_price, position)
     select $1::uuid, i.feature_id, i.name, i.description, i.qty, i.unit_price, i.position
     from jsonb_to_recordset($2::jsonb) as i(feature_id uuid, name text, description text, qty numeric, unit_price numeric, position int)`,
    [quote.id, JSON.stringify(items)]
  );
  if (itemsError) {
    await dbRows("delete from quotes where id = $1", [quote.id]);
    throw new Error(itemsError.message);
  }

  revalidatePath("/cotizaciones");
  redirect(`/cotizaciones/${quote.id}`);
}

/**
 * Cambia el estado. Efectos sobre el prospecto vinculado:
 *  - Enviada: si estaba en nuevo/contactado/respondió, pasa a Calificado.
 *  - Aceptada: se marca Ganado con el total como valor del trato (crea cliente y proyecto).
 */
export async function setQuoteStatus(id: string, status: QuoteStatus) {
  await requireUser();
  if (!QUOTE_STATUSES.includes(status)) throw new Error("Estado inválido");

  const { data: quote, error } = await dbRow<{
    lead_id: string | null;
    discount_pct: number;
    tax_pct: number;
    quote_items: { qty: number; unit_price: number }[];
  }>(
    `with q as (update quotes set status = $1 where id = $2 returning id, lead_id, discount_pct, tax_pct)
     select q.lead_id, q.discount_pct, q.tax_pct,
       coalesce((select json_agg(json_build_object('qty', i.qty, 'unit_price', i.unit_price)) from quote_items i where i.quote_id = q.id), '[]'::json) as quote_items
     from q`,
    [status, id]
  );
  if (error || !quote) throw new Error(error?.message ?? "Cotización no encontrada");

  if (quote.lead_id) {
    const { data: lead } = await dbRow<{ status: string }>("select status from leads where id = $1", [quote.lead_id]);

    if (status === "sent" && lead && ["new", "contacted", "replied"].includes(lead.status)) {
      await setLeadStatus(quote.lead_id, "qualified");
    }

    if (status === "accepted" && lead && lead.status !== "won") {
      const { total } = calcTotals(quote.quote_items as { qty: number; unit_price: number }[], Number(quote.discount_pct), Number(quote.tax_pct));
      await setLeadStatus(quote.lead_id, "won", { dealValue: total });
    }

    if (status === "accepted") {
      // Liga la cotización con el cliente creado a partir del prospecto
      const { data: client } = await dbRow<{ id: string }>("select id from clients where lead_id = $1", [quote.lead_id]);
      if (client) await dbRows("update quotes set client_id = $1 where id = $2", [client.id, id]);
    }
  }

  revalidatePath("/", "layout");
}

export async function deleteQuote(id: string) {
  await requireUser();
  const { error } = await dbRows("delete from quotes where id = $1", [id]);
  if (error) throw new Error(error.message);
  revalidatePath("/cotizaciones");
  redirect("/cotizaciones");
}
