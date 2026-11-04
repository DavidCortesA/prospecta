import { Suspense } from "react";
import Link from "next/link";
import { AlarmClock, Plus, Search } from "lucide-react";
import { dbRow, dbRows } from "@/lib/db";
import { LEAD_STATUSES, STATUS_LABEL, type LeadStatus } from "@/lib/constants";
import { dateShort, dayLabel, followupState, timeAgo, todayKey } from "@/lib/format";
import { Card, EmptyState, LinkButton, MigrationNotice, PageHeader, StatusBadge, TableShell, btn, inputCls, isMissingColumn } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export const metadata = { title: "Prospectos" };

const PAGE_SIZE = 30;

export default function Page(props: PageProps<"/prospectos">) {
  return (
    <>
      <PageHeader
        title="Prospectos"
        subtitle="Todos los contactos que el bot encontró o que agregaste a mano."
        actions={
          <LinkButton href="/prospectos/nuevo">
            <Plus className="size-4" /> Nuevo prospecto
          </LinkButton>
        }
      />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-secondary" />}>
        <List searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/prospectos">["searchParams"] }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" && (LEAD_STATUSES as readonly string[]).includes(sp.status) ? sp.status : "";
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const due = sp.due === "1";
  const today = todayKey();

  // Filtros con valores enlazados ($n); las columnas son fijas
  const where: string[] = [];
  const values: unknown[] = [];
  if (status) {
    values.push(status);
    where.push(`status = $${values.length}`);
  }
  if (due) {
    values.push(today);
    where.push(`next_followup <= $${values.length}`, "status not in ('won', 'lost')");
  }
  if (q) {
    const term = q.replace(/[%,()]/g, " ");
    values.push(`%${term}%`);
    const p = `$${values.length}`;
    where.push(`(name ilike ${p} or company ilike ${p} or email ilike ${p} or phone ilike ${p})`);
  }
  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  const limit = values.length + 1;

  const [{ data: leads, error: listError }, { data: countRow }, { data: all }, { data: dueRow }] = await Promise.all([
    dbRows(
      `select id, name, company, email, phone, city, status, score, deal_value, next_followup, created_at, (select json_build_object('name', s.name) from sources s where s.id = leads.source_id) as sources from leads ${whereSql} order by created_at desc limit $${limit} offset $${limit + 1}`,
      [...values, PAGE_SIZE, (page - 1) * PAGE_SIZE]
    ),
    dbRow<{ n: number }>(`select count(*)::int as n from leads ${whereSql}`, values),
    dbRows<{ status: string }>("select status from leads limit 5000"),
    dbRow<{ n: number }>("select count(*)::int as n from leads where next_followup <= $1 and status not in ('won', 'lost')", [today]),
  ]);
  const count = countRow?.n;
  const dueCount = dueRow?.n;

  if (isMissingColumn(listError)) return <MigrationNotice file="0007_followups.sql" />;

  const counts: Record<string, number> = {};
  for (const l of all ?? []) counts[l.status] = (counts[l.status] ?? 0) + 1;
  const totalAll = (all ?? []).length;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const href = (patch: Record<string, string | number>) => {
    const p = new URLSearchParams();
    const merged = { q, status, due: due ? "1" : "", page: 1, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v !== "" && !(k === "page" && v === 1)) p.set(k, String(v));
    const s = p.toString();
    return s ? `/prospectos?${s}` : "/prospectos";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={href({ status: "", due: "" })} className={chip(!status && !due)}>
          Todos <span className="opacity-60">{totalAll}</span>
        </Link>
        <Link href={href({ status: "", due: "1" })} className={chip(due)}>
          <AlarmClock className="size-3.5" /> Por seguir <span className="opacity-60">{dueCount ?? 0}</span>
        </Link>
        {LEAD_STATUSES.map((s) => (
          <Link key={s} href={href({ status: s, due: "" })} className={chip(status === s)}>
            {STATUS_LABEL[s as LeadStatus]} <span className="opacity-60">{counts[s] ?? 0}</span>
          </Link>
        ))}
      </div>

      <form className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <input name="q" defaultValue={q} placeholder="Buscar por nombre, empresa, correo o teléfono" className={cn(inputCls, "pl-9")} />
        {status && <input type="hidden" name="status" value={status} />}
      </form>

      <Card>
        {leads?.length ? (
          <TableShell>
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-semibold">Prospecto</th>
                  <th className="px-3 py-3 font-semibold">Contacto</th>
                  <th className="hidden px-3 py-3 font-semibold md:table-cell">Fuente</th>
                  <th className="px-3 py-3 font-semibold">Estado</th>
                  <th className="hidden px-3 py-3 font-semibold sm:table-cell">Score</th>
                  <th className="hidden px-3 py-3 font-semibold md:table-cell">Seguimiento</th>
                  <th className="hidden px-3 py-3 font-semibold lg:table-cell">Creado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {leads.map((l) => (
                  <tr key={l.id} className="transition hover:bg-secondary/50">
                    <td className="px-5 py-3">
                      <Link href={`/prospectos/${l.id}`} className="font-semibold hover:text-primary">
                        {l.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{l.company ?? "Sin empresa"}{l.city ? ` · ${l.city}` : ""}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p>{l.email ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{l.phone ?? ""}</p>
                    </td>
                    <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">
                      {(l.sources as { name?: string } | null)?.name ?? "Manual"}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={l.status} />
                    </td>
                    <td className="hidden px-3 py-3 font-semibold sm:table-cell">{l.score}</td>
                    <td className="hidden px-3 py-3 md:table-cell">
                      {l.next_followup ? (
                        <span className={followupState(l.next_followup, today) === "overdue" ? "font-semibold text-rose-600" : followupState(l.next_followup, today) === "today" ? "font-semibold text-amber-600" : "text-muted-foreground"}>
                          {followupState(l.next_followup, today) === "overdue" ? "Vencido · " : ""}
                          {dayLabel(l.next_followup)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-3 text-muted-foreground lg:table-cell" title={dateShort(l.created_at)}>
                      {timeAgo(l.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        ) : (
          <EmptyState
            title={q || status ? "Sin resultados" : "Aún no hay prospectos"}
            text={q || status ? "Prueba con otro filtro o búsqueda." : "Agrega una fuente para que el bot los traiga o crea uno manualmente."}
            action={<LinkButton href="/prospectos/nuevo">Nuevo prospecto</LinkButton>}
          />
        )}
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Página {page} de {pages} · {count} resultados
          </span>
          <div className="flex gap-2">
            {page > 1 && <Link href={href({ page: page - 1 })} className={btn.outline}>Anterior</Link>}
            {page < pages && <Link href={href({ page: page + 1 })} className={btn.outline}>Siguiente</Link>}
          </div>
        </div>
      )}
    </div>
  );
}

const chip = (active: boolean) =>
  cn(
    "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 ring-inset transition",
    active ? "bg-sidebar text-sidebar-accent-foreground ring-sidebar" : "bg-card text-muted-foreground ring-border hover:text-foreground"
  );
