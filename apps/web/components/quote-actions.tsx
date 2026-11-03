"use client";

import { useState } from "react";
import { Check, Clipboard, Printer } from "lucide-react";
import { btn } from "@/components/ui-kit";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={btn.outline}>
      <Printer className="size-4" /> Imprimir / PDF
    </button>
  );
}

export function CopyButton({ text, label = "Copiar resumen" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={btn.outline}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          // el portapapeles puede estar bloqueado; no hay nada que hacer
        }
      }}
    >
      {done ? <Check className="size-4" /> : <Clipboard className="size-4" />}
      {done ? "Copiado" : label}
    </button>
  );
}
