-- Gestión de prospectos: valor del trato, motivo de pérdida, cierre y bitácora automática

alter table public.leads
  add column if not exists deal_value  numeric(12,2),
  add column if not exists lost_reason text,
  add column if not exists closed_at   timestamptz;

-- Permite pedir una ejecución inmediata desde el dashboard; el worker la recoge y la limpia
alter table public.sources
  add column if not exists run_requested_at timestamptz;

-- closed_at se mantiene solo
create or replace function public.leads_track_close() returns trigger
language plpgsql as $$
begin
  if new.status in ('won', 'lost') then
    if tg_op = 'INSERT' or old.status is distinct from new.status then
      new.closed_at = now();
    end if;
  else
    new.closed_at = null;
  end if;
  return new;
end $$;

drop trigger if exists leads_close on public.leads;
create trigger leads_close before insert or update on public.leads
for each row execute function public.leads_track_close();

-- Bitácora: creación y cambios de estado
create or replace function public.leads_log_events() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.lead_events (lead_id, type, payload)
    values (new.id, 'created', jsonb_build_object('status', new.status));
  elsif old.status is distinct from new.status then
    insert into public.lead_events (lead_id, type, payload)
    values (new.id, 'status_change', jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return null;
end $$;

drop trigger if exists leads_events on public.leads;
create trigger leads_events after insert or update on public.leads
for each row execute function public.leads_log_events();

create index if not exists leads_closed_idx on public.leads (closed_at desc) where closed_at is not null;
