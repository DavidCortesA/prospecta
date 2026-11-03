import { config } from "./config.js";
import { db } from "./db.js";
import { changeStatus, getLead } from "./leads.js";
import { escapeHtml, notify, type Keyboard } from "./telegram.js";

type Item = { qty: number; unit_price: number };

// Todo el sistema trabaja en pesos mexicanos: $1,500.00
const money = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const quoteNumber = (n: number) => `COT-${String(n).padStart(4, "0")}`;

function total(items: Item[], discountPct: number, taxPct: number) {
  const subtotal = items.reduce((a, i) => a + Number(i.qty) * Number(i.unit_price), 0);
  const taxable = subtotal * (1 - discountPct / 100);
  return taxable * (1 + taxPct / 100);
}

const dashboardButton = (quoteId: string): Keyboard | undefined =>
  config.dashboardUrl ? [[{ text: "Abrir cotización", url: `${config.dashboardUrl}/cotizaciones/${quoteId}` }]] : undefined;

/**
 * Atiende lo que el cliente hace en la página pública de la cotización (se ejecuta cada ~20 s):
 *  - Aceptó: gana el prospecto (crea cliente y proyecto), enlaza la cotización con el cliente y avisa.
 *  - Abrió por primera vez: avisa.
 * Cada evento se "reclama" con un update condicional para no procesarlo dos veces.
 */
export async function pollQuoteEvents(): Promise<void> {
  const { data: accepted, error } = await db
    .from("quotes")
    .select("id, number, title, discount_pct, tax_pct, lead_id, customer_name, accepted_name, client_comment, quote_items(qty, unit_price)")
    .not("accepted_at", "is", null)
    .is("accepted_notified_at", null)
    .limit(10);
  if (error) return; // las columnas no existen si falta la migración 0009

  for (const q of accepted ?? []) {
    const { data: claimed } = await db
      .from("quotes")
      .update({ accepted_notified_at: new Date().toISOString() })
      .eq("id", q.id)
      .is("accepted_notified_at", null)
      .select("id");
    if (!claimed?.length) continue;

    const amount = total(q.quote_items as Item[], Number(q.discount_pct), Number(q.tax_pct));
    let followUp = "";

    if (q.lead_id) {
      const lead = await getLead(q.lead_id);
      if (lead && lead.status !== "won") await changeStatus(q.lead_id, "won", { dealValue: amount });
      const { data: client } = await db.from("clients").select("id").eq("lead_id", q.lead_id).maybeSingle();
      if (client) {
        await db.from("quotes").update({ client_id: client.id }).eq("id", q.id);
        followUp = "\nSe creó el cliente y su proyecto en el dashboard.";
      }
    }

    await notify(
      `🎉 <b>${escapeHtml(q.accepted_name ?? q.customer_name)}</b> aceptó la cotización ${quoteNumber(q.number)}\n` +
        `${escapeHtml(q.title)} · <b>${escapeHtml(money(amount))}</b>` +
        (q.client_comment ? `\n💬 “${escapeHtml(q.client_comment)}”` : "") +
        followUp,
      dashboardButton(q.id)
    );
  }

  const { data: viewed } = await db
    .from("quotes")
    .select("id, number, title, customer_name, view_count")
    .not("viewed_at", "is", null)
    .is("viewed_notified_at", null)
    .is("accepted_at", null)
    .limit(10);

  for (const q of viewed ?? []) {
    const { data: claimed } = await db
      .from("quotes")
      .update({ viewed_notified_at: new Date().toISOString() })
      .eq("id", q.id)
      .is("viewed_notified_at", null)
      .select("id");
    if (!claimed?.length) continue;

    await notify(
      `👀 <b>${escapeHtml(q.customer_name)}</b> abrió la cotización ${quoteNumber(q.number)}\n${escapeHtml(q.title)}`,
      dashboardButton(q.id)
    );
  }
}
