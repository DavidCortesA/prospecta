import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, FileText, Plus, Trash2 } from "lucide-react";
import { dbRow, dbRows } from "@/lib/db";
import { PROJECT_LABEL, PROJECT_STATUSES, QUOTE_LABEL, QUOTE_TONE, type ProjectStatus, type QuoteStatus } from "@/lib/constants";
import { dateShort, money, pct } from "@/lib/format";
import { Badge, Card, CardHeader, LinkButton, Progress, btn, inputCls } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import {
  addMilestone,
  createProject,
  deleteCustomer,
  deleteMilestone,
  deleteProject,
  toggleMilestone,
  updateCustomer,
  updateProject,
} from "../actions";

export default function Page(props: PageProps<"/clientes/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-secondary" />}>
      <Detail params={props.params} />
    </Suspense>
  );
}

type Milestone = { id: string; title: string; done: boolean; position: number };

async function Detail({ params }: { params: PageProps<"/clientes/[id]">["params"] }) {
  const { id } = await params;
  const [{ data: client }, { data: projects }, { data: quotes }] = await Promise.all([
    dbRow("select * from clients where id = $1", [id]),
    dbRows(
      `select p.*, coalesce((select json_agg(json_build_object('id', m.id, 'title', m.title, 'done', m.done, 'position', m.position)) from project_milestones m where m.project_id = p.id), '[]'::json) as project_milestones
       from projects p where p.client_id = $1 order by p.created_at desc`,
      [id]
    ),
    // La tabla de cotizaciones llega en una migración posterior; si no existe se ignora.
    dbRows(
      `select q.id, q.number, q.title, q.status, q.created_at, coalesce((select json_agg(json_build_object('qty', i.qty, 'unit_price', i.unit_price)) from quote_items i where i.quote_id = q.id), '[]'::json) as quote_items
       from quotes q where q.client_id = $1 order by q.created_at desc`,
      [id]
    ),
  ]);
  if (!client) notFound();

  return (
    <div className="space-y-6">
      <Link href="/clientes" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Clientes
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{client.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {client.company ?? "Sin empresa"} · cliente desde {dateShort(client.created_at)}
          </p>
        </div>
        <div className="flex gap-2">
          {client.lead_id && (
            <LinkButton href={`/prospectos/${client.lead_id}`} variant="outline">
              Ver prospecto original
            </LinkButton>
          )}
          <LinkButton href={`/cotizaciones/nueva?client=${client.id}`}>
            <FileText className="size-4" /> Nueva cotización
          </LinkButton>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {(projects ?? []).map((p) => {
            const ms = ((p.project_milestones ?? []) as Milestone[]).sort((a, b) => a.position - b.position);
            const done = ms.filter((m) => m.done).length;
            const progress = pct(done, ms.length);
            return (
              <Card key={p.id}>
                <div className="flex items-start justify-between gap-3 px-5 pt-5">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold">{p.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {p.budget != null ? money(p.budget) : "Sin presupuesto"}
                      {p.due_date ? ` · entrega ${dateShort(p.due_date)}` : ""}
                    </p>
                  </div>
                  <Badge className={p.status === "delivered" ? "bg-emerald-100 text-emerald-800 ring-emerald-200" : p.status === "paused" ? "bg-zinc-100 text-zinc-600 ring-zinc-200" : "bg-sky-100 text-sky-800 ring-sky-200"}>
                    {PROJECT_LABEL[p.status as ProjectStatus]}
                  </Badge>
                </div>

                <div className="px-5 py-4">
                  <div className="mb-1.5 flex justify-between text-xs font-semibold">
                    <span>Avance</span>
                    <span>
                      {done}/{ms.length} hitos · {progress}%
                    </span>
                  </div>
                  <Progress value={progress} />
                </div>

                <ul className="divide-y border-t">
                  {ms.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-5 py-2.5">
                      <form action={toggleMilestone.bind(null, m.id, client.id, !m.done)}>
                        <button
                          aria-label={m.done ? "Marcar pendiente" : "Marcar hecho"}
                          className={cn(
                            "grid size-5 place-items-center rounded-md border transition",
                            m.done ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-primary"
                          )}
                        >
                          {m.done && <Check className="size-3.5" />}
                        </button>
                      </form>
                      <span className={cn("flex-1 text-sm", m.done && "text-muted-foreground line-through")}>{m.title}</span>
                      <form action={deleteMilestone.bind(null, m.id, client.id)}>
                        <button aria-label="Quitar hito" className="rounded p-1 text-muted-foreground hover:text-rose-600">
                          <Trash2 className="size-3.5" />
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
                <form action={addMilestone.bind(null, p.id, client.id)} className="flex gap-2 border-t p-4">
                  <input name="title" placeholder="Agregar hito…" className={inputCls} />
                  <button className={btn.outline}>Añadir</button>
                </form>

                <details className="border-t">
                  <summary className="cursor-pointer list-none px-5 py-3 text-xs font-semibold text-primary">Editar proyecto</summary>
                  <form action={updateProject.bind(null, p.id, client.id)} className="grid gap-3 border-t p-5 sm:grid-cols-2">
                    <input name="name" required defaultValue={p.name} className={inputCls} />
                    <select name="status" defaultValue={p.status} className={inputCls}>
                      {PROJECT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {PROJECT_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <input name="budget" type="number" step="0.01" min={0} defaultValue={p.budget ?? ""} placeholder="Presupuesto" className={inputCls} />
                    <div className="grid grid-cols-2 gap-2">
                      <input name="start_date" type="date" defaultValue={p.start_date ?? ""} className={inputCls} aria-label="Inicio" />
                      <input name="due_date" type="date" defaultValue={p.due_date ?? ""} className={inputCls} aria-label="Entrega" />
                    </div>
                    <textarea name="notes" rows={2} defaultValue={p.notes ?? ""} placeholder="Notas" className={`${inputCls} sm:col-span-2`} />
                    <div className="flex gap-2 sm:col-span-2">
                      <button className={btn.primary}>Guardar</button>
                    </div>
                  </form>
                  <form action={deleteProject.bind(null, p.id, client.id)} className="border-t px-5 py-3">
                    <button className="text-xs font-semibold text-rose-600 hover:underline">Eliminar proyecto</button>
                  </form>
                </details>
              </Card>
            );
          })}

          <details className="rounded-2xl border bg-card shadow-sm" open={!projects?.length}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-bold">
              <Plus className="size-4 text-primary" /> Nuevo proyecto
            </summary>
            <form action={createProject.bind(null, client.id)} className="grid gap-3 border-t p-5 sm:grid-cols-2">
              <input name="name" required placeholder="Nombre del proyecto *" className={`${inputCls} sm:col-span-2`} />
              <input name="budget" type="number" step="0.01" min={0} placeholder="Presupuesto" className={inputCls} />
              <input name="start_date" type="date" className={inputCls} aria-label="Inicio" />
              <input name="due_date" type="date" className={inputCls} aria-label="Entrega" />
              <p className="text-xs text-muted-foreground sm:col-span-2">Se crea con 5 hitos base que puedes editar.</p>
              <div className="sm:col-span-2">
                <button className={btn.primary}>Crear proyecto</button>
              </div>
            </form>
          </details>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Datos del cliente" />
            <form action={updateCustomer.bind(null, client.id)} className="space-y-3 p-5">
              <input name="name" required defaultValue={client.name} className={inputCls} />
              <input name="company" defaultValue={client.company ?? ""} placeholder="Empresa" className={inputCls} />
              <input name="email" type="email" defaultValue={client.email ?? ""} placeholder="Correo" className={inputCls} />
              <input name="phone" defaultValue={client.phone ?? ""} placeholder="Teléfono" className={inputCls} />
              <input name="website" defaultValue={client.website ?? ""} placeholder="Sitio web" className={inputCls} />
              <textarea name="notes" rows={3} defaultValue={client.notes ?? ""} placeholder="Notas" className={inputCls} />
              <button className={btn.primary}>Guardar</button>
            </form>
          </Card>

          <Card>
            <CardHeader title="Cotizaciones" />
            {quotes?.length ? (
              <ul className="divide-y">
                {quotes.map((q) => {
                  const total = ((q.quote_items ?? []) as { qty: number; unit_price: number }[]).reduce((a, i) => a + i.qty * i.unit_price, 0);
                  return (
                    <li key={q.id}>
                      <Link href={`/cotizaciones/${q.id}`} className="flex items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-secondary/60">
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">COT-{String(q.number).padStart(4, "0")} · {q.title}</span>
                          <span className="text-xs text-muted-foreground">{money(total)}</span>
                        </span>
                        <Badge className={QUOTE_TONE[q.status as QuoteStatus]}>{QUOTE_LABEL[q.status as QuoteStatus]}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-5 py-6 text-center text-sm text-muted-foreground">Sin cotizaciones para este cliente.</p>
            )}
          </Card>

          <form action={deleteCustomer.bind(null, client.id)}>
            <button className={`${btn.ghost} text-rose-600 hover:text-rose-700`}>Eliminar cliente</button>
          </form>
        </div>
      </div>
    </div>
  );
}
