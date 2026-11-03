-- Cotización pública: el cliente abre un enlace (sin iniciar sesión), la revisa y puede aceptarla.
-- El acceso anónimo NO toca las tablas: solo ejecuta dos funciones que exigen el token secreto del enlace.

alter table public.quotes
  add column if not exists share_token         text,
  add column if not exists viewed_at           timestamptz,
  add column if not exists view_count          int not null default 0,
  add column if not exists accepted_at         timestamptz,
  add column if not exists accepted_name       text,
  add column if not exists client_comment      text,
  add column if not exists viewed_notified_at  timestamptz,
  add column if not exists accepted_notified_at timestamptz;

-- Token largo e impredecible (2 UUID = 244 bits aleatorios), también para las cotizaciones que ya existen
update public.quotes
   set share_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
 where share_token is null;

alter table public.quotes
  alter column share_token set default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  alter column share_token set not null;

create unique index if not exists quotes_share_token_uniq on public.quotes (share_token);

-- Datos de la cotización para la página pública. Con p_track = true cuenta la visita.
create or replace function public.public_quote(p_token text, p_track boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q     public.quotes%rowtype;
  items jsonb;
begin
  select * into q from public.quotes where share_token = p_token;
  if not found then
    return null;
  end if;

  if p_track then
    update public.quotes
       set viewed_at = coalesce(viewed_at, now()), view_count = view_count + 1
     where id = q.id;
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_object('name', i.name, 'description', i.description, 'qty', i.qty, 'unit_price', i.unit_price)
             order by i.position
           ),
           '[]'::jsonb)
    into items
    from public.quote_items i
   where i.quote_id = q.id;

  return jsonb_build_object(
    'number', q.number,
    'title', q.title,
    'status', q.status,
    'currency', q.currency,
    'discount_pct', q.discount_pct,
    'tax_pct', q.tax_pct,
    'valid_until', q.valid_until,
    'notes', q.notes,
    'customer_name', q.customer_name,
    'customer_company', q.customer_company,
    'created_at', q.created_at,
    'accepted_at', q.accepted_at,
    'accepted_name', q.accepted_name,
    'items', items
  );
end $$;

-- El cliente acepta la cotización. Devuelve {"ok": true} o {"ok": false, "error": "<motivo>"}.
create or replace function public.accept_public_quote(p_token text, p_name text, p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q     public.quotes%rowtype;
  today date := (now() at time zone 'America/Mexico_City')::date;
  who   text := left(trim(coalesce(p_name, '')), 120);
begin
  if who = '' then
    return jsonb_build_object('ok', false, 'error', 'name_required');
  end if;

  select * into q from public.quotes where share_token = p_token for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if q.accepted_at is not null or q.status = 'accepted' then
    return jsonb_build_object('ok', false, 'error', 'already');
  end if;
  if q.status = 'rejected' then
    return jsonb_build_object('ok', false, 'error', 'rejected');
  end if;
  if q.valid_until is not null and q.valid_until < today then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  update public.quotes
     set status = 'accepted',
         accepted_at = now(),
         accepted_name = who,
         client_comment = nullif(left(trim(coalesce(p_comment, '')), 1000), '')
   where id = q.id;

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.public_quote(text, boolean) from public;
revoke all on function public.accept_public_quote(text, text, text) from public;
grant execute on function public.public_quote(text, boolean) to anon, authenticated;
grant execute on function public.accept_public_quote(text, text, text) to anon, authenticated;
