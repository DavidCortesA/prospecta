-- Auditoría del sitio web de un prospecto (la ejecuta el worker con Playwright, bajo demanda)

create table public.site_audits (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  url         text not null,
  status      text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  score       int check (score between 0 and 100),   -- salud del sitio: 100 = sin problemas
  headline    text,                                   -- frase lista para usar en un mensaje de venta
  metrics     jsonb not null default '{}'::jsonb,
  issues      jsonb not null default '[]'::jsonb,
  screenshot  text,                                   -- captura móvil (data URL JPEG, pequeña)
  error       text,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);

create index site_audits_lead_idx on public.site_audits (lead_id, created_at desc);
create index site_audits_open_idx on public.site_audits (status) where status in ('pending', 'running');

-- Plantilla de ejemplo que usa el hallazgo de la auditoría ({{hallazgo}})
insert into public.message_templates (name, channel, subject, body, is_default) values
  ('Sitio con problemas', 'whatsapp', null,
   E'Hola, buen día. Soy {{negocio}}. Revisé el sitio web de {{empresa}} y noté que {{hallazgo}}. Podemos ayudarles a corregirlo. ¿Le comparto una propuesta sin compromiso?',
   false);
