import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { LeadStatus } from "@/lib/constants";
import { dateShort, dayLabel, followupState, timeAgo } from "@/lib/format";
import { FIRST_DIR, SORT_HINT, type SortDir, type SortKey } from "@/lib/lead-sort";
import { TableShell } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { StatusSelect } from "./status-select";

export type LeadRow = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  status: LeadStatus;
  score: number;
  next_followup: string | null;
  created_at: string;
  sources: { name?: string } | null;
};

type HrefFor = (patch: Record<string, string | number>) => string;

/** Encabezado de columna ordenable: un clic ordena, otro invierte; la flecha indica el orden activo. */
function SortTh({
  label,
  k,
  sort,
  dir,
  hrefFor,
  className,
}: {
  label: string;
  k: SortKey;
  sort: SortKey;
  dir: SortDir;
  hrefFor: HrefFor;
  className?: string;
}) {
  const active = sort === k;
  const next: SortDir = active ? (dir === "asc" ? "desc" : "asc") : FIRST_DIR[k];
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className={cn("px-3 py-3 font-semibold", className)}>
      <Link
        href={hrefFor({ sort: k, dir: next, page: 1 })}
        title={`Ordenar: ${SORT_HINT[k][next]}`}
        className={cn("inline-flex items-center gap-1 whitespace-nowrap transition hover:text-foreground", active && "text-foreground")}
      >
        {label}
        <Icon className={cn("size-3.5", active ? "text-primary" : "opacity-40")} />
      </Link>
    </th>
  );
}

export function LeadsTable({ leads, sort, dir, today, hrefFor }: { leads: LeadRow[]; sort: SortKey; dir: SortDir; today: string; hrefFor: HrefFor }) {
  const th = { sort, dir, hrefFor };
  return (
    <TableShell>
      <table className="w-full text-left text-sm">
        <thead className="border-b text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <SortTh label="Prospecto" k="name" {...th} className="px-5" />
            <th className="px-3 py-3 font-semibold">Contacto</th>
            <SortTh label="Fuente" k="source" {...th} className="hidden md:table-cell" />
            <SortTh label="Estado" k="status" {...th} />
            <SortTh label="Score" k="score" {...th} className="hidden sm:table-cell" />
            <SortTh label="Seguimiento" k="followup" {...th} className="hidden md:table-cell" />
            <SortTh label="Creado" k="created" {...th} className="hidden lg:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {leads.map((l) => {
            const state = l.next_followup ? followupState(l.next_followup, today) : null;
            return (
              <tr key={l.id} className="transition hover:bg-secondary/50">
                <td className="px-5 py-3">
                  <Link href={`/prospectos/${l.id}`} className="font-semibold hover:text-primary">
                    {l.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {l.company ?? "Sin empresa"}
                    {l.city ? ` · ${l.city}` : ""}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <p>{l.email ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{l.phone ?? ""}</p>
                </td>
                <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">{l.sources?.name ?? "Manual"}</td>
                <td className="px-3 py-3">
                  <StatusSelect id={l.id} name={l.name} status={l.status} />
                </td>
                <td className="hidden px-3 py-3 font-semibold sm:table-cell">{l.score}</td>
                <td className="hidden px-3 py-3 md:table-cell">
                  {l.next_followup ? (
                    <span className={state === "overdue" ? "font-semibold text-rose-600" : state === "today" ? "font-semibold text-amber-600" : "text-muted-foreground"}>
                      {state === "overdue" ? "Vencido · " : ""}
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
            );
          })}
        </tbody>
      </table>
    </TableShell>
  );
}
