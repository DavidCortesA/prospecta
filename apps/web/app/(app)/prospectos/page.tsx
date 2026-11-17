import { Suspense } from "react";
import Link from "next/link";
import { AlarmClock, Plus, Search } from "lucide-react";
import { dbRow, dbRows } from "@/lib/db";
import { LEAD_STATUSES, STATUS_LABEL, type LeadStatus } from "@/lib/constants";
import { todayKey } from "@/lib/format";
import { DEFAULT_SORT, orderBySql, parseSort } from "@/lib/lead-sort";
import { Card, EmptyState, LinkButton, MigrationNotice, PageHeader, btn, inputCls, isMissingColumn } from "@/components/ui-kit";
import { LeadsTable, type LeadRow } from "./leads-table";
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
  const { key: sortKey, dir: sortDir } = parseSort(sp.sort, sp.dir);
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
      `select id, name, company, email, phone, city, status, score, deal_value, next_followup, created_at, (select json_build_object('name', s.name) from sources s where s.id = leads.source_id) as sources from leads ${whereSql} ${orderBySql(sortKey, sortDir)} limit $${limit} offset $${limit + 1}`,
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
    const isDefaultSort = sortKey === DEFAULT_SORT.key && sortDir === DEFAULT_SORT.dir;
    const merged = { q, status, due: due ? "1" : "", ...(isDefaultSort ? {} : { sort: sortKey, dir: sortDir }), page: 1, ...patch };
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
        {due && <input type="hidden" name="due" value="1" />}
        {(sortKey !== DEFAULT_SORT.key || sortDir !== DEFAULT_SORT.dir) && (
          <>
            <input type="hidden" name="sort" value={sortKey} />
            <input type="hidden" name="dir" value={sortDir} />
          </>
        )}
      </form>

      <Card>
        {leads?.length ? (
          <LeadsTable leads={leads as LeadRow[]} sort={sortKey} dir={sortDir} today={today} hrefFor={href} />
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
