"use client";

import { useTransition } from "react";
import { Mail, MessageCircle } from "lucide-react";
import { btn } from "@/components/ui-kit";
import { logContact } from "../actions";

export type ContactItem = {
  id: string;
  name: string;
  channel: "whatsapp" | "email";
  href: string;
  preview: string;
  isDefault: boolean;
};

/** Abre WhatsApp/correo con el mensaje ya escrito y registra el contacto (pasa el prospecto a Contactado). */
export function ContactActions({ leadId, items }: { leadId: string; items: ContactItem[] }) {
  const [, startTransition] = useTransition();

  return (
    <ul className="divide-y">
      {items.map((it) => (
        <li key={it.id} className="space-y-2 px-5 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              {it.channel === "whatsapp" ? <MessageCircle className="size-3.5 text-emerald-600" /> : <Mail className="size-3.5 text-sky-600" />}
              {it.name}
            </p>
            <a
              href={it.href}
              target={it.channel === "whatsapp" ? "_blank" : undefined}
              rel="noopener noreferrer"
              onClick={() => startTransition(() => logContact(leadId, it.channel, it.name))}
              className={`${btn.primary} px-3 py-1.5 text-xs`}
            >
              {it.channel === "whatsapp" ? "Abrir WhatsApp" : "Abrir correo"}
            </a>
          </div>
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Ver mensaje</summary>
            <p className="mt-2 whitespace-pre-line rounded-lg bg-secondary/70 p-3 text-xs leading-relaxed">{it.preview}</p>
          </details>
        </li>
      ))}
    </ul>
  );
}
