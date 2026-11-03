import { Suspense } from "react";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/server";
import { QUOTE_LABEL, QUOTE_STATUSES, QUOTE_TONE, type QuoteStatus } from "@/lib/constants";
import { dateShort, dateTime, money, timeAgo } from "@/lib/format";
import { businessName, calcTotals, quoteNumber } from "@/lib/quotes";
import { Badge, MigrationNotice, btn, inputCls } from "@/components/ui-kit";
import { QuoteDocument } from "@/components/quote-document";
import { CopyButton, PrintButton } from "@/components/quote-actions";
import { deleteQuote, setQuoteStatus } from "../actions";

export default function Page(props: PageProps<"/cotizaciones/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-secondary" />}>
      <Detail params={props.params} />
    </Suspense>
  );
}

type Item = { id: string; name: string; description: string | null; qty: number; unit_price: number; position: number };

async function Detail({ params }: { params: PageProps<"/cotizaciones/[id]">["params"] }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: q } = await supabase.from("quotes").select("*, quote_items(*)").eq("id", id).maybeSingle();
  if (!q) notFound();

  const items = ((q.quote_items ?? []) as Item[]).sort((a, b) => a.position - b.position);
  const t = calcTotals(items, Number(q.discount_pct), Number(q.tax_pct));
  const number = quoteNumber(q.number);
  const status = q.status as QuoteStatus;

  // Enlace público: se arma con el dominio desde el que se está viendo el dashboard
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const shareUrl = q.share_token ? `${proto}://${host}/q/${q.share_token}` : null;
  const whatsappShare = shareUrl
    ? `https://wa.me/?text=${encodeURIComponent(`Hola ${q.customer_name}, le comparto la cotización ${number} de ${businessName}: ${shareUrl}`)}`
    : null;

  const summary = [
    `${businessName} — ${number}: ${q.title}`,
    `Para: ${q.customer_name}${q.customer_company ? ` (${q.customer_company})` : ""}`,
    "",
    ...items.map((i) => `• ${i.name}${i.qty !== 1 ? ` x${i.qty}` : ""}: ${money(i.qty * i.unit_price, q.currency)}`),
    "",
    ...(t.discount ? [`Descuento: -${money(t.discount, q.currency)}`] : []),
    ...(t.tax ? [`Impuesto: ${money(t.tax, q.currency)}`] : []),
    `TOTAL: ${money(t.total, q.currency)}`,
    ...(q.valid_until ? [`Válida hasta: ${dateShort(q.valid_until)}`] : []),
  ].join("\n");

  return (
    <div className="space-y-6">
      <div className="no-print space-y-4">
        <Link href="/cotizaciones" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Cotizaciones
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Badge className={QUOTE_TONE[status]}>{QUOTE_LABEL[status]}</Badge>
            <div className="flex flex-wrap gap-1.5">
              {QUOTE_STATUSES.filter((s) => s !== status).map((s) => (
                <form key={s} action={setQuoteStatus.bind(null, q.id, s)}>
                  <button className={`${btn.outline} px-3 py-1.5 text-xs`}>
                    {s === "sent" ? "Marcar enviada" : s === "accepted" ? "Aceptada ✓" : s === "rejected" ? "Rechazada" : "A borrador"}
                  </button>
                </form>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={summary} />
            <PrintButton />
          </div>
        </div>
        {shareUrl ? (
          <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
            <p className="text-sm font-bold">Enlace para el cliente</p>
            <div className="flex flex-wrap gap-2">
              <input readOnly value={shareUrl} aria-label="Enlace de la cotización" className={`${inputCls} min-w-60 flex-1 font-mono text-xs`} />
              <CopyButton text={shareUrl} label="Copiar enlace" />
              <a href={whatsappShare!} target="_blank" rel="noopener noreferrer" className={btn.outline}>
                Enviar por WhatsApp
              </a>
              <a href={`${shareUrl}?p=1`} target="_blank" rel="noopener noreferrer" className={btn.outline}>
                Vista previa
              </a>
            </div>
            <p className="text-xs text-muted-foreground">
              {q.accepted_at ? (
                <>
                  ✅ <strong>Aceptada por {q.accepted_name}</strong> el {dateTime(q.accepted_at)}
                  {q.client_comment ? ` · “${q.client_comment}”` : ""}
                </>
              ) : q.viewed_at ? (
                <>👁 El cliente la abrió {timeAgo(q.viewed_at)} ({q.view_count} {q.view_count === 1 ? "visita" : "visitas"}). Te avisaré por Telegram cuando la acepte.</>
              ) : (
                <>Todavía no la han abierto. Te avisaré por Telegram cuando la abran y cuando la acepten.</>
              )}
            </p>
          </div>
        ) : (
          <MigrationNotice file="0009_public_quotes.sql" />
        )}
        {status !== "accepted" && q.lead_id && (
          <p className="text-xs text-muted-foreground">
            Al marcarla <strong>enviada</strong> el prospecto pasa a Calificado; al marcarla <strong>aceptada</strong> se gana, se crea el cliente y su proyecto.
          </p>
        )}
      </div>

      <QuoteDocument quote={q} items={items} />

      <form action={deleteQuote.bind(null, q.id)} className="no-print text-center">
        <button className={`${btn.ghost} text-rose-600 hover:text-rose-700`}>Eliminar cotización</button>
      </form>
    </div>
  );
}
