import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { dbRows } from "@/lib/db";
import { PROJECT_LABEL, type ProjectStatus } from "@/lib/constants";
import { pct } from "@/lib/format";
import { Badge, Card, EmptyState, MigrationNotice, PageHeader, Progress, btn, inputCls, isMissingTable } from "@/components/ui-kit";
import { createCustomer } from "./actions";

export const metadata = { title: "Clientes" };

export default function Page(props: PageProps<"/clientes">) {
  return (
    <>
      <PageHeader title="Clientes" subtitle="Prospectos que se concretaron y el avance de sus proyectos." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-secondary" />}>
        <Customers searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Customers({ searchParams }: { searchParams: PageProps<"/clientes">["searchParams"] }) {
  const { error: errorParam } = await searchParams;
  const { data: clients, error } = await dbRows(
    `select c.id, c.name, c.company, c.email, c.created_at,
       coalesce((select json_agg(json_build_object('id', p.id, 'name', p.name, 'status', p.status,
         'project_milestones', coalesce((select json_agg(json_build_object('done', m.done)) from project_milestones m where m.project_id = p.id), '[]'::json)))
         from projects p where p.client_id = c.id), '[]'::json) as projects
     from clients c order by c.created_at desc`
  );

  if (isMissingTable(error)) return <MigrationNotice file="0003_clients_projects.sql" />;

  return (
    <div className="space-y-6">
      {typeof errorParam === "string" && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorParam}</p>}

      <details className="rounded-2xl border bg-card shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-bold">
          <Plus className="size-4 text-primary" /> Agregar cliente que ya tengo
        </summary>
        <form action={createCustomer} className="grid gap-3 border-t p-5 sm:grid-cols-2">
          <input name="name" required placeholder="Nombre *" className={inputCls} />
          <input name="company" placeholder="Empresa" className={inputCls} />
          <input name="email" type="email" placeholder="Correo" className={inputCls} />
          <input name="phone" placeholder="Teléfono" className={inputCls} />
          <div className="sm:col-span-2">
            <button className={btn.primary}>Crear cliente</button>
          </div>
        </form>
      </details>

      {clients?.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clients.map((c) => {
            const projects = (c.projects ?? []) as { id: string; name: string; status: ProjectStatus; project_milestones: { done: boolean }[] }[];
            return (
              <Link key={c.id} href={`/clientes/${c.id}`} className="group">
                <Card className="h-full p-5 transition group-hover:-translate-y-0.5 group-hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-bold group-hover:text-primary">{c.name}</h3>
                      <p className="truncate text-xs text-muted-foreground">{c.company ?? c.email ?? "Sin empresa"}</p>
                    </div>
                    <Badge className="bg-secondary text-muted-foreground ring-border">
                      {projects.length} {projects.length === 1 ? "proyecto" : "proyectos"}
                    </Badge>
                  </div>
                  <div className="mt-4 space-y-3">
                    {projects.slice(0, 3).map((p) => {
                      const done = p.project_milestones.filter((m) => m.done).length;
                      const value = pct(done, p.project_milestones.length);
                      return (
                        <div key={p.id}>
                          <div className="mb-1 flex justify-between gap-2 text-xs">
                            <span className="truncate font-semibold">{p.name}</span>
                            <span className="shrink-0 text-muted-foreground">
                              {PROJECT_LABEL[p.status]} · {value}%
                            </span>
                          </div>
                          <Progress value={value} />
                        </div>
                      );
                    })}
                    {!projects.length && <p className="text-xs text-muted-foreground">Sin proyectos todavía.</p>}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="Aún no tienes clientes"
            text="Cuando marques un prospecto como ganado aparecerá aquí con su proyecto. También puedes agregar uno que ya tengas."
          />
        </Card>
      )}
    </div>
  );
}
