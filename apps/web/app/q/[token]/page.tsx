import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/server";
import { dateTime, money } from "@/lib/format";
import { businessName, calcTotals, quoteNumber } from "@/lib/quotes";
import { QuoteDocument, type QuoteDocItem } from "@/components/quote-document";
import { PrintButton } from "@/components/quote-actions";
import { btn, inputCls } from "@/components/ui-kit";
import { acceptQuote } from "./actions";

// Página pública: sin sesión y fuera de los buscadores.
export const metadata: Metadata = {
  title: "Cotización",
  robots: { index: false, follow: false },
};

const ERRORS: Record<string, string> = {
  agree: "Marca la casilla para confirmar que aceptas la cotización.",
  name_required: "Escribe tu nombre para aceptar.",
  expired: "Esta cotización ya venció. Pide una nueva a quien te la envió.",
  rejected: "Esta cotización fue cancelada. Pide una nueva a quien te la envió.",
  already: "Esta cotización ya fue aceptada.",
  not_found: "No encontramos esta cotización.",
  unknown: "No se pudo registrar la aceptación. Inténtalo de nuevo.",
};

// Vistas previas de WhatsApp, Telegram, buscadores, etc. no deben contarse como "el cliente la abrió"
const BOT_UA = /bot|crawler|spider|preview|whatsapp|facebookexternalhit|telegram|slack|discord|linkedin|twitter/i;

export default function Page(props: PageProps<"/q/[token]">) {
  return (
    <main className="min-h-screen bg-secondary/40 px-4 py-8 sm:py-12">
      <Suspense fallback={<div className="mx-auto h-96 max-w-3xl animate-pulse rounded-2xl bg-secondary" />}>
        <PublicQuote params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

type PublicQuoteData = {
  number: number;
  title: string;
  status: "draft" | "sent" | "accepted" | "rejected";
  discount_pct: number;
  tax_pct: number;
  valid_until: string | null;
  notes: string | null;
  customer_name: string;
  customer_company: string | null;
  created_at: string;
  accepted_at: string | null;
  accepted_name: string | null;
  items: QuoteDocItem[];
};

async function PublicQuote({
  params,
  searchParams,
}: {
  params: PageProps<"/q/[token]">["params"];
  searchParams: PageProps<"/q/[token]">["searchParams"];
}) {
  const { token } = await params;
  const sp = await searchParams;
  const h = await headers();

  // ?p=1 lo usa el dashboard para la vista previa del dueño (no cuenta como visita del cliente)
  const track = sp.p !== "1" && !BOT_UA.test(h.get("user-agent") ?? "");

  const supabase = await createClient();
  const { data } = await supabase.rpc("public_quote", { p_token: token, p_track: track });
  const quote = data as PublicQuoteData | null;
  if (!quote) notFound();

  const accepted = quote.status === "accepted" || !!quote.accepted_at;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
  const expired = !accepted && !!quote.valid_until && quote.valid_until < today;
  const cancelled = quote.status === "rejected";
  const total = calcTotals(quote.items, Number(quote.discount_pct), Number(quote.tax_pct)).total;
  const error = typeof sp.error === "string" ? ERRORS[sp.error] ?? ERRORS.unknown : null;
  const justAccepted = sp.accepted === "1";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {(accepted || justAccepted) && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-bold">{justAccepted ? "¡Gracias! Tu aceptación quedó registrada." : "Cotización aceptada"}</p>
            <p className="mt-0.5 text-sm">
              {quote.accepted_name ? `Aceptada por ${quote.accepted_name}` : "Aceptada"}
              {quote.accepted_at ? ` el ${dateTime(quote.accepted_at)}` : ""}. {businessName} se pondrá en contacto contigo para los siguientes pasos.
            </p>
          </div>
        </div>
      )}

      <QuoteDocument quote={{ ...quote, customer_email: null }} items={quote.items} />

      <div className="no-print flex justify-center">
        <PrintButton />
      </div>

      {!accepted && !justAccepted && (
        <section className="no-print mx-auto max-w-3xl rounded-2xl border bg-card p-6 shadow-sm">
          {expired || cancelled ? (
            <p className="text-sm font-medium text-rose-700">{expired ? ERRORS.expired : ERRORS.rejected}</p>
          ) : (
            <form action={acceptQuote.bind(null, token)} className="space-y-4">
              <div>
                <h2 className="text-lg font-extrabold tracking-tight">¿Todo bien con la cotización?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Al aceptar, avisamos a {businessName} para comenzar. Total: <strong>{money(total)}</strong>
                  {quote.valid_until ? ` · válida hasta el ${new Intl.DateTimeFormat("es", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${quote.valid_until}T12:00:00Z`))}` : ""}.
                </p>
              </div>
              {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
              <input name="name" required maxLength={120} placeholder="Tu nombre completo" autoComplete="name" className={inputCls} />
              <textarea name="comment" rows={2} maxLength={1000} placeholder="Comentarios (opcional)" className={inputCls} />
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="agree" className="mt-0.5 size-4 accent-[var(--primary)]" />
                <span>Acepto el alcance, los conceptos y el total de esta cotización.</span>
              </label>
              <button className={`${btn.primary} w-full py-3 text-base`}>Aceptar cotización</button>
              <p className="text-center text-xs text-muted-foreground">
                ¿Dudas o cambios? Responde directamente al mensaje con el que recibiste este enlace.
              </p>
            </form>
          )}
        </section>
      )}

      <p className="no-print text-center text-xs text-muted-foreground">
        {quoteNumber(quote.number)} · {businessName}
      </p>
    </div>
  );
}
