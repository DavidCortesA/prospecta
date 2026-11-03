"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { LEAD_STATUSES, STATUS_BAR, STATUS_LABEL, type LeadStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { setLeadStatus } from "../prospectos/actions";

export type KanbanLead = {
  id: string;
  name: string;
  company: string | null;
  score: number;
  status: LeadStatus;
  deal_value: number | null;
};

export function Kanban({ initial }: { initial: KanbanLead[] }) {
  const [leads, setLeads] = useState(initial);
  const [over, setOver] = useState<LeadStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function move(id: string, to: LeadStatus) {
    const prev = leads;
    if (prev.find((l) => l.id === id)?.status === to) return;
    setLeads((cur) => cur.map((l) => (l.id === id ? { ...l, status: to } : l)));
    setError(null);
    startTransition(async () => {
      try {
        await setLeadStatus(id, to);
      } catch (e) {
        setLeads(prev);
        setError(e instanceof Error ? e.message : "No se pudo mover");
      }
    });
  }

  return (
    <>
      {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        {LEAD_STATUSES.map((status) => {
          const col = leads.filter((l) => l.status === status);
          return (
            <section
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((o) => (o === status ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id) move(id, status);
              }}
              className={cn(
                "flex w-64 shrink-0 flex-col rounded-2xl bg-secondary/70 p-3 transition",
                over === status && "bg-primary/10 ring-2 ring-primary/40"
              )}
            >
              <header className="mb-3 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className={cn("size-2.5 rounded-full", STATUS_BAR[status])} />
                  <h2 className="text-sm font-bold">{STATUS_LABEL[status]}</h2>
                </div>
                <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-muted-foreground">{col.length}</span>
              </header>
              <div className="min-h-24 space-y-2.5">
                {col.map((l) => (
                  <article
                    key={l.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", l.id)}
                    className="cursor-grab rounded-xl border bg-card p-3 shadow-sm transition hover:shadow-md active:cursor-grabbing"
                  >
                    <Link href={`/prospectos/${l.id}`} className="block text-sm font-semibold leading-snug hover:text-primary">
                      {l.name}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{l.company ?? "Sin empresa"}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-muted-foreground">Score {l.score}</span>
                      {/* Alternativa táctil al arrastre */}
                      <select
                        aria-label="Mover a"
                        value={l.status}
                        onChange={(e) => move(l.id, e.target.value as LeadStatus)}
                        className="max-w-28 rounded-md border bg-card px-1.5 py-1 text-[11px] font-medium"
                      >
                        {LEAD_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </article>
                ))}
                {!col.length && <p className="px-1 py-4 text-center text-xs text-muted-foreground">Arrastra prospectos aquí</p>}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
