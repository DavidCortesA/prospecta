-- Seguimientos: fecha del próximo contacto por prospecto

alter table public.leads add column if not exists next_followup date;

create index if not exists leads_followup_idx
  on public.leads (next_followup)
  where next_followup is not null;

-- Reglas por defecto (las comparten el dashboard y el bot de Telegram):
--  * Al pasar a "Contactado" sin fecha, se agenda seguimiento en 3 días.
--  * Al cerrar (ganado / perdido) se borra el seguimiento.
create or replace function public.leads_followup_defaults() returns trigger
language plpgsql as $$
begin
  if new.status in ('won', 'lost') then
    new.next_followup = null;
  elsif tg_op = 'UPDATE'
        and old.status is distinct from new.status
        and new.status = 'contacted'
        and new.next_followup is null then
    new.next_followup = (now() at time zone 'America/Mexico_City')::date + 3;
  end if;
  return new;
end $$;

drop trigger if exists leads_followup on public.leads;
create trigger leads_followup before update on public.leads
for each row execute function public.leads_followup_defaults();
