-- Ubicación de los prospectos (mapa y rutas de visita)

alter table public.leads
  add column if not exists lat     double precision,
  add column if not exists lng     double precision,
  add column if not exists address text;

create index if not exists leads_location_idx on public.leads (lat, lng) where lat is not null;
