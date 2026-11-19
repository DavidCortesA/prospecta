-- Agente de WhatsApp (Kapso): conversaciones y mensajes.
-- El webhook de la web guarda aquí cada mensaje; `handoff` indica que una persona tomó el control
-- y el agente de IA ya no debe contestar esa conversación.

create table if not exists public.whatsapp_conversations (
  phone          text primary key,                       -- solo dígitos, p. ej. 5218112345678
  contact_name   text,
  lead_id        uuid references public.leads(id) on delete set null,
  handoff        boolean not null default false,
  handoff_reason text,
  handoff_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.whatsapp_messages (
  id               uuid primary key default gen_random_uuid(),
  phone            text not null references public.whatsapp_conversations(phone) on delete cascade,
  direction        text not null check (direction in ('in', 'out')),
  sender           text not null check (sender in ('customer', 'ai', 'human')),
  body             text not null,
  -- id del mensaje de WhatsApp (wamid); evita procesar dos veces el mismo mensaje si Kapso reintenta la entrega
  kapso_message_id text unique,
  created_at       timestamptz not null default now()
);

create index if not exists whatsapp_messages_phone_idx on public.whatsapp_messages (phone, created_at desc);
