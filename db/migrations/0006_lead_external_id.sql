-- Evita duplicados de fuentes que identifican cada registro con un id propio (p. ej. DENUE de INEGI),
-- incluso cuando el negocio no tiene correo ni sitio web.

alter table public.leads add column if not exists external_id text;

create unique index if not exists leads_source_external_uniq
  on public.leads (source_id, external_id)
  where external_id is not null;
