"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { QUOTE_STATUSES, type QuoteStatus } from "@/lib/constants";
import { calcTotals, type QuoteInput } from "@/lib/quotes";
import { setLeadStatus } from "../prospectos/actions";

const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
const money = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0);

export async function createQuote(input: QuoteInput) {
  const { supabase } = await requireUser();

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

  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({
      title: clean(input.title) ?? "Cotización",
      lead_id: input.lead_id || null,
      client_id: input.client_id || null,
      customer_name: clean(input.customer_name) ?? "Cliente",
      customer_company: clean(input.customer_company),
      customer_email: clean(input.customer_email),
      currency: input.currency || "USD",
      discount_pct: Math.min(100, Math.max(0, money(input.discount_pct))),
      tax_pct: Math.min(100, Math.max(0, money(input.tax_pct))),
      valid_until: clean(input.valid_until),
      notes: clean(input.notes),
    })
    .select("id")
    .single();
  if (error || !quote) throw new Error(error?.message ?? "No se pudo crear la cotización");

  const { error: itemsError } = await supabase.from("quote_items").insert(items.map((i) => ({ ...i, quote_id: quote.id })));
  if (itemsError) {
    await supabase.from("quotes").delete().eq("id", quote.id);
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
  const { supabase } = await requireUser();
  if (!QUOTE_STATUSES.includes(status)) throw new Error("Estado inválido");

  const { data: quote, error } = await supabase
    .from("quotes")
    .update({ status })
    .eq("id", id)
    .select("lead_id, discount_pct, tax_pct, quote_items(qty, unit_price)")
    .single();
  if (error || !quote) throw new Error(error?.message ?? "Cotización no encontrada");

  if (quote.lead_id) {
    const { data: lead } = await supabase.from("leads").select("status").eq("id", quote.lead_id).maybeSingle();

    if (status === "sent" && lead && ["new", "contacted", "replied"].includes(lead.status)) {
      await setLeadStatus(quote.lead_id, "qualified");
    }

    if (status === "accepted" && lead && lead.status !== "won") {
      const { total } = calcTotals(quote.quote_items as { qty: number; unit_price: number }[], Number(quote.discount_pct), Number(quote.tax_pct));
      await setLeadStatus(quote.lead_id, "won", { dealValue: total });
    }

    if (status === "accepted") {
      // Liga la cotización con el cliente creado a partir del prospecto
      const { data: client } = await supabase.from("clients").select("id").eq("lead_id", quote.lead_id).maybeSingle();
      if (client) await supabase.from("quotes").update({ client_id: client.id }).eq("id", id);
    }
  }

  revalidatePath("/", "layout");
}

export async function deleteQuote(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/cotizaciones");
  redirect("/cotizaciones");
}
