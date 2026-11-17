"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { LEAD_STATUSES, STATUS_LABEL, STATUS_TONE, type LeadStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { setLeadStatus } from "./actions";

/**
 * Cambia el estado de un prospecto desde la tabla. Ganar crea el cliente y su proyecto (igual que en el detalle);
 * el motivo de una pérdida o el valor del trato se pueden agregar después desde la ficha.
 */
export function StatusSelect({ id, name, status }: { id: string; name: string; status: LeadStatus }) {
  const [value, setValue] = useState<LeadStatus>(status);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function change(next: LeadStatus) {
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      try {
        await setLeadStatus(id, next);
      } catch (e) {
        // En producción Next oculta el texto del error del servidor, así que se muestra un mensaje fijo y claro
        console.error("No se pudo cambiar el estado", e);
        setValue(previous);
        setError("No se pudo cambiar. Recarga la página e inténtalo de nuevo.");
      }
    });
  }

  return (
    <div className="relative inline-block">
      <select
        aria-label={`Estado de ${name}`}
        value={value}
        disabled={pending}
        onChange={(e) => change(e.target.value as LeadStatus)}
        className={cn(
          "cursor-pointer appearance-none rounded-full py-1 pl-2.5 pr-7 text-xs font-semibold ring-1 ring-inset transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-70",
          STATUS_TONE[value]
        )}
      >
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s} className="bg-card text-foreground">
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      {pending ? (
        <Loader2 className="pointer-events-none absolute right-2 top-1.5 size-3.5 animate-spin opacity-70" />
      ) : (
        <ChevronDown className="pointer-events-none absolute right-2 top-1.5 size-3.5 opacity-60" />
      )}
      {error && <p className="mt-1 max-w-40 text-[11px] font-medium text-rose-600">{error}</p>}
    </div>
  );
}
