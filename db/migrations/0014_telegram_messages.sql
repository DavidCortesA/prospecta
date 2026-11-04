-- Qué prospecto corresponde a cada ficha enviada por Telegram (para responder con palabras clave o botones).
-- Antes vivía en Redis; ahora está en Neon para que también la escriban los trabajos programados de GitHub Actions.

create table if not exists public.telegram_messages (
  message_id bigint primary key,
  lead_id    uuid not null references public.leads(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists telegram_messages_created_idx on public.telegram_messages (created_at);
