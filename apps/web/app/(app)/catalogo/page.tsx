import { Suspense } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/server";
import { money } from "@/lib/format";
import { Badge, Card, EmptyState, MigrationNotice, PageHeader, btn, inputCls, isMissingTable } from "@/components/ui-kit";
import { createFeature, deleteFeature, toggleFeature, updateFeature } from "./actions";

export const metadata = { title: "Catálogo" };

export default function Page(props: PageProps<"/catalogo">) {
  return (
    <>
      <PageHeader
        title="Catálogo de features"
        subtitle="Lo que ofreces, con su precio. Se usa para armar cotizaciones en segundos."
      />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-secondary" />}>
        <Catalog searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

type Feature = { id: string; name: string; description: string | null; category: string; price: number; hours: number | null; active: boolean };

function FeatureForm({ action, f, submit }: { action: (fd: FormData) => Promise<void>; f?: Feature; submit: string }) {
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input name="name" required defaultValue={f?.name} placeholder="Nombre *" className={inputCls} />
      <input name="category" list="categories" defaultValue={f?.category ?? "General"} placeholder="Categoría" className={inputCls} />
      <input name="price" type="number" step="0.01" min={0} required defaultValue={f?.price ?? ""} placeholder="Precio en pesos (MXN)" className={inputCls} />
      <input name="hours" type="number" step="0.5" min={0} defaultValue={f?.hours ?? ""} placeholder="Horas estimadas (opcional)" className={inputCls} />
      <textarea name="description" rows={2} defaultValue={f?.description ?? ""} placeholder="Descripción que verá el cliente" className={`${inputCls} sm:col-span-2`} />
      <div className="sm:col-span-2">
        <button className={btn.primary}>{submit}</button>
      </div>
    </form>
  );
}

async function Catalog({ searchParams }: { searchParams: PageProps<"/catalogo">["searchParams"] }) {
  const { error: errorParam } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.from("features").select("*").order("category").order("name");

  if (isMissingTable(error)) return <MigrationNotice file="0004_catalog_quotes.sql" />;

  const features = (data ?? []) as Feature[];
  const categories = [...new Set(features.map((f) => f.category))];

  return (
    <div className="space-y-6">
      {typeof errorParam === "string" && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorParam}</p>}

      <datalist id="categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <details className="rounded-2xl border bg-card shadow-sm" open={!features.length}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-bold">
          <Plus className="size-4 text-primary" /> Nueva feature
        </summary>
        <div className="border-t p-5">
          <FeatureForm action={createFeature} submit="Agregar al catálogo" />
        </div>
      </details>

      {categories.map((cat) => (
        <section key={cat}>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{cat}</h2>
          <Card>
            <ul className="divide-y">
              {features
                .filter((f) => f.category === cat)
                .map((f) => (
                  <li key={f.id}>
                    <div className="flex items-start justify-between gap-4 px-5 py-4">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {f.name} {!f.active && <Badge className="ml-1 bg-zinc-100 text-zinc-600 ring-zinc-200">Oculta</Badge>}
                        </p>
                        {f.description && <p className="mt-0.5 text-sm text-muted-foreground">{f.description}</p>}
                        {f.hours != null && <p className="mt-1 text-xs text-muted-foreground">{f.hours} h estimadas</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="mr-2 text-lg font-extrabold">{money(f.price)}</span>
                        <form action={toggleFeature.bind(null, f.id, !f.active)}>
                          <button className={`${btn.ghost} px-2 text-xs`}>{f.active ? "Ocultar" : "Mostrar"}</button>
                        </form>
                        <form action={deleteFeature.bind(null, f.id)}>
                          <button aria-label="Eliminar" className={`${btn.ghost} px-2 text-rose-600 hover:text-rose-700`}>
                            <Trash2 className="size-4" />
                          </button>
                        </form>
                      </div>
                    </div>
                    <details className="border-t bg-secondary/30">
                      <summary className="cursor-pointer list-none px-5 py-2 text-xs font-semibold text-primary">Editar</summary>
                      <div className="border-t p-5">
                        <FeatureForm action={updateFeature.bind(null, f.id)} f={f} submit="Guardar cambios" />
                      </div>
                    </details>
                  </li>
                ))}
            </ul>
          </Card>
        </section>
      ))}

      {!features.length && (
        <Card>
          <EmptyState
            title="Tu catálogo está vacío"
            text="Agrega lo que vendes (landing, panel, integraciones…). Si quieres datos de ejemplo, ejecuta 0005_seed_features_example.sql en Supabase."
          />
        </Card>
      )}
    </div>
  );
}
