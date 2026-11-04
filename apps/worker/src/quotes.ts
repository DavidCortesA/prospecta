import { config } from "./config.js";
import { query } from "./db.js";
import { changeStatus, getLead } from "./leads.js";
import { escapeHtml, notify, type Keyboard } from "./telegram.js";

type Item = { qty: number; unit_price: number };

type AcceptedQuote = {
  id: string;
  number: number;
  title: string;
  discount_pct: string | number;
  tax_pct: string | number;
  lead_id: string | null;
  customer_name: string;
  accepted_name: string | null;
  client_comment: string | null;
  quote_items: Item[];
};

type ViewedQuote = { id: string; number: number; title: string; customer_name: string; view_count: number };

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
  let accepted: AcceptedQuote[];
  try {
    // quote_items: relación embebida como arreglo de { qty, unit_price }
    ({ rows: accepted } = await query<AcceptedQuote>(
      `SELECT q.id, q.number, q.title, q.discount_pct, q.tax_pct, q.lead_id, q.customer_name, q.accepted_name, q.client_comment,
              COALESCE((SELECT json_agg(json_build_object('qty', i.qty, 'unit_price', i.unit_price) ORDER BY i.position)
                          FROM quote_items i WHERE i.quote_id = q.id), '[]'::json) AS quote_items
         FROM quotes q
        WHERE q.accepted_at IS NOT NULL AND q.accepted_notified_at IS NULL
        LIMIT 10`
    ));
  } catch {
    return; // las columnas no existen si falta la migración 0009
  }

  for (const q of accepted) {
    const claimed = await query(
      "UPDATE quotes SET accepted_notified_at = $1 WHERE id = $2 AND accepted_notified_at IS NULL RETURNING id",
      [new Date().toISOString(), q.id]
    ).then((r) => r.rows, () => []);
    if (!claimed.length) continue;

    const amount = total(q.quote_items, Number(q.discount_pct), Number(q.tax_pct));
    let followUp = "";

    if (q.lead_id) {
      const lead = await getLead(q.lead_id);
      if (lead && lead.status !== "won") await changeStatus(q.lead_id, "won", { dealValue: amount });
      const client = await query<{ id: string }>("SELECT id FROM clients WHERE lead_id = $1", [q.lead_id]).then((r) => r.rows[0], () => undefined);
      if (client) {
        await query("UPDATE quotes SET client_id = $1 WHERE id = $2", [client.id, q.id]).catch(() => {});
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

  const viewed = await query<ViewedQuote>(
    `SELECT id, number, title, customer_name, view_count FROM quotes
      WHERE viewed_at IS NOT NULL AND viewed_notified_at IS NULL AND accepted_at IS NULL LIMIT 10`
  ).then((r) => r.rows, () => []);

  for (const q of viewed) {
    const claimed = await query(
      "UPDATE quotes SET viewed_notified_at = $1 WHERE id = $2 AND viewed_notified_at IS NULL RETURNING id",
      [new Date().toISOString(), q.id]
    ).then((r) => r.rows, () => []);
    if (!claimed.length) continue;

    await notify(
      `👀 <b>${escapeHtml(q.customer_name)}</b> abrió la cotización ${quoteNumber(q.number)}\n${escapeHtml(q.title)}`,
      dashboardButton(q.id)
    );
  }
}
