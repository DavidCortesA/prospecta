"use client";

import { useMemo, useState, useTransition } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { money } from "@/lib/format";
import { calcTotals, type QuoteInput } from "@/lib/quotes";
import { btn, inputCls } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { createQuote } from "./actions";

export type CatalogFeature = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  price: number;
};

type Line = { key: string; feature_id: string | null; name: string; description: string; qty: number; unit_price: number };

type Defaults = {
  title: string;
  lead_id: string | null;
  client_id: string | null;
  customer_name: string;
  customer_company: string;
  customer_email: string;
  valid_until: string;
};

let seq = 0;
const nextKey = () => `l${++seq}`;

export function QuoteBuilder({ features, defaults }: { features: CatalogFeature[]; defaults: Defaults }) {
  const [form, setForm] = useState(defaults);
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [notes, setNotes] = useState("");
  const [custom, setCustom] = useState({ name: "", price: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const categories = useMemo(() => [...new Set(features.map((f) => f.category))], [features]);
  const totals = calcTotals(lines, discount, tax);
  const set = <K extends keyof Defaults>(k: K, v: Defaults[K]) => setForm((f) => ({ ...f, [k]: v }));

  function toggleFeature(f: CatalogFeature) {
    setLines((cur) =>
      cur.some((l) => l.feature_id === f.id)
        ? cur.filter((l) => l.feature_id !== f.id)
        : [...cur, { key: nextKey(), feature_id: f.id, name: f.name, description: f.description ?? "", qty: 1, unit_price: f.price }]
    );
  }

  const patch = (key: string, p: Partial<Line>) => setLines((cur) => cur.map((l) => (l.key === key ? { ...l, ...p } : l)));

  function addCustom() {
    const name = custom.name.trim();
    if (!name) return;
    setLines((cur) => [...cur, { key: nextKey(), feature_id: null, name, description: "", qty: 1, unit_price: Number(custom.price) || 0 }]);
    setCustom({ name: "", price: "" });
  }

  function submit() {
    setError(null);
    if (!form.customer_name.trim()) return setError("Escribe para quién es la cotización");
    if (!lines.length) return setError("Elige al menos una feature o agrega un concepto");

    const input: QuoteInput = {
      title: form.title,
      lead_id: form.lead_id,
      client_id: form.client_id,
      customer_name: form.customer_name,
      customer_company: form.customer_company || null,
      customer_email: form.customer_email || null,
      discount_pct: discount,
      tax_pct: tax,
      valid_until: form.valid_until || null,
      notes: notes || null,
      items: lines.map((l) => ({ feature_id: l.feature_id, name: l.name, description: l.description || null, qty: l.qty, unit_price: l.unit_price })),
    };
    startTransition(async () => {
      try {
        await createQuote(input);
      } catch (e) {
        // redirect() lanza una excepción especial que Next maneja; solo mostramos errores reales
        if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
        setError(e instanceof Error ? e.message : "No se pudo crear la cotización");
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-3">
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold">1. ¿Para quién es?</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} placeholder="Nombre *" className={inputCls} />
            <input value={form.customer_company} onChange={(e) => set("customer_company", e.target.value)} placeholder="Empresa" className={inputCls} />
            <input value={form.customer_email} onChange={(e) => set("customer_email", e.target.value)} placeholder="Correo" type="email" className={inputCls} />
            <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Título de la cotización" className={inputCls} />
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-bold">2. Elige las features que pidió</h2>
          <p className="mb-4 text-xs text-muted-foreground">Toca una feature para agregarla o quitarla.</p>
          {features.length ? (
            <div className="space-y-5">
              {categories.map((cat) => (
                <div key={cat}>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{cat}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {features
                      .filter((f) => f.category === cat)
                      .map((f) => {
                        const on = lines.some((l) => l.feature_id === f.id);
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => toggleFeature(f)}
                            className={cn(
                              "rounded-xl border p-3 text-left transition",
                              on ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "bg-card hover:border-primary/50 hover:bg-secondary/50"
                            )}
                          >
                            <span className="flex items-start justify-between gap-2">
                              <span className="text-sm font-semibold">{f.name}</span>
                              <span className="shrink-0 text-sm font-extrabold">{money(f.price)}</span>
                            </span>
                            {f.description && <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{f.description}</span>}
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-secondary p-4 text-sm text-muted-foreground">
              Tu catálogo está vacío. Agrega features en <strong>Catálogo</strong> o usa un concepto personalizado aquí abajo.
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
            <input value={custom.name} onChange={(e) => setCustom((c) => ({ ...c, name: e.target.value }))} placeholder="Concepto personalizado" className={cn(inputCls, "min-w-48 flex-1")} />
            <input value={custom.price} onChange={(e) => setCustom((c) => ({ ...c, price: e.target.value }))} placeholder="Precio" type="number" min={0} step="0.01" className={cn(inputCls, "w-32")} />
            <button type="button" onClick={addCustom} className={btn.outline}>
              <Plus className="size-4" /> Agregar
            </button>
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold">3. Condiciones</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Descuento %</span>
              <input type="number" min={0} max={100} step="0.5" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className={inputCls} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Impuesto %</span>
              <input type="number" min={0} max={100} step="0.5" value={tax} onChange={(e) => setTax(Number(e.target.value))} className={inputCls} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Válida hasta</span>
              <input type="date" value={form.valid_until} onChange={(e) => set("valid_until", e.target.value)} className={inputCls} />
            </label>
          </div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Notas o condiciones (forma de pago, tiempos de entrega, alcance…)" className={cn(inputCls, "mt-3")} />
        </section>
      </div>

      {/* Resumen en vivo */}
      <aside className="lg:col-span-2">
        <div className="sticky top-6 rounded-2xl border bg-card shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-bold">Resumen</h2>
          </div>
          {lines.length ? (
            <ul className="divide-y">
              {lines.map((l) => (
                <li key={l.key} className="space-y-2 px-5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold">{l.name}</span>
                    <button type="button" aria-label="Quitar" onClick={() => setLines((c) => c.filter((x) => x.key !== l.key))} className="text-muted-foreground hover:text-rose-600">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-lg border">
                      <button type="button" aria-label="Menos" onClick={() => patch(l.key, { qty: Math.max(1, l.qty - 1) })} className="px-2 py-1.5 hover:bg-secondary">
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm font-semibold">{l.qty}</span>
                      <button type="button" aria-label="Más" onClick={() => patch(l.key, { qty: l.qty + 1 })} className="px-2 py-1.5 hover:bg-secondary">
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <span className="text-xs text-muted-foreground">×</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.unit_price}
                      onChange={(e) => patch(l.key, { unit_price: Number(e.target.value) })}
                      className={cn(inputCls, "w-28 py-1.5")}
                      aria-label="Precio unitario"
                    />
                    <span className="ml-auto text-sm font-bold">{money(l.qty * l.unit_price)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">Aún no hay conceptos.</p>
          )}

          <dl className="space-y-1.5 border-t px-5 py-4 text-sm">
            <Row label="Subtotal" value={money(totals.subtotal)} />
            {discount > 0 && <Row label={`Descuento (${discount}%)`} value={`− ${money(totals.discount)}`} />}
            {tax > 0 && <Row label={`Impuesto (${tax}%)`} value={money(totals.tax)} />}
            <div className="flex items-baseline justify-between border-t pt-3">
              <dt className="font-bold">Total</dt>
              <dd className="text-2xl font-extrabold">{money(totals.total)}</dd>
            </div>
          </dl>

          <div className="space-y-2 border-t p-5">
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <button type="button" onClick={submit} disabled={pending} className={`${btn.primary} w-full py-2.5`}>
              {pending ? "Guardando…" : "Crear cotización"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
