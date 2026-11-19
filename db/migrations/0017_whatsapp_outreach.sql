-- WhatsApp sin IA: el sistema solo manda el primer mensaje (plantilla aprobada por Meta) y, cuando el
-- prospecto responde, te avisa y una persona toma la conversación. Se retira el traspaso del agente.

alter table public.whatsapp_conversations
  drop column if exists handoff,
  drop column if exists handoff_reason,
  drop column if exists handoff_at;

-- Ahora solo hay mensajes del cliente o enviados por el sistema (primer contacto)
update public.whatsapp_messages set sender = 'system' where sender in ('ai', 'human');
alter table public.whatsapp_messages drop constraint if exists whatsapp_messages_sender_check;
alter table public.whatsapp_messages add constraint whatsapp_messages_sender_check check (sender in ('customer', 'system'));

-- Un solo primer mensaje por prospecto. La fila se reserva ANTES de enviar (estado 'pending'), así que dos
-- corridas simultáneas jamás le escriben dos veces al mismo prospecto.
create table if not exists public.whatsapp_outreach (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid not null unique references public.leads(id) on delete cascade,
  phone            text not null,
  template_name    text not null,
  status           text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error            text,
  kapso_message_id text,
  created_at       timestamptz not null default now(),
  sent_at          timestamptz
);

create index if not exists whatsapp_outreach_day_idx on public.whatsapp_outreach (created_at);
