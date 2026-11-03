-- Prospecta: esquema inicial

create extension if not exists "pgcrypto";

-- Fuentes de las que se obtienen prospectos (directorios, APIs, webs propias).
-- `scraping_allowed` solo se activa cuando los términos del sitio y robots.txt lo permiten.
create table public.sources (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  kind             text not null check (kind in ('api', 'web', 'csv', 'manual')),
  url              text,
  config           jsonb not null default '{}'::jsonb,
  scraping_allowed boolean not null default false,
  enabled          boolean not null default true,
  cron             text,
  last_run_at      timestamptz,
  created_at       timestamptz not null default now()
);

create table public.leads (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid references public.sources(id) on delete set null,
  name        text not null,
  company     text,
  email       text,
  phone       text,
  website     text,
  city        text,
  status      text not null default 'new'
              check (status in ('new', 'contacted', 'replied', 'qualified', 'won', 'lost')),
  score       int  not null default 0 check (score between 0 and 100),
  notes       text,
  raw         jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index leads_email_uniq on public.leads (lower(email)) where email is not null;
create unique index leads_website_uniq on public.leads (lower(website)) where website is not null;
create index leads_status_idx on public.leads (status);
create index leads_created_idx on public.leads (created_at desc);

create table public.lead_events (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index lead_events_lead_idx on public.lead_events (lead_id, created_at desc);

create table public.job_runs (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid references public.sources(id) on delete set null,
  queue       text not null,
  status      text not null default 'running' check (status in ('running', 'done', 'failed')),
  found       int not null default 0,
  inserted    int not null default 0,
  error       text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index job_runs_started_idx on public.job_runs (started_at desc);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger leads_touch before update on public.leads
for each row execute function public.touch_updated_at();

-- RLS: solo usuarios autenticados (el dashboard). El worker usa la service role key.
alter table public.sources     enable row level security;
alter table public.leads       enable row level security;
alter table public.lead_events enable row level security;
alter table public.job_runs    enable row level security;

create policy "auth all sources"     on public.sources     for all to authenticated using (true) with check (true);
create policy "auth all leads"       on public.leads       for all to authenticated using (true) with check (true);
create policy "auth all lead_events" on public.lead_events for all to authenticated using (true) with check (true);
create policy "auth read job_runs"   on public.job_runs    for select to authenticated using (true);
