-- Acceso restringido a usuarios autorizados.
--
-- Hasta ahora las políticas permitían todo a CUALQUIER usuario autenticado. Si el registro de usuarios está
-- abierto en Supabase (Authentication → Sign In / Providers → "Allow new users to sign up"), cualquiera con un
-- correo propio podría crear una cuenta y leer o modificar los datos. Desde esta migración solo entran los
-- usuarios que estén en public.app_users, aunque el registro siga abierto.
--
-- Para dar acceso a otra persona (primero debe existir en Authentication → Users):
--   insert into public.app_users (user_id, note)
--   select id, 'socio' from auth.users where email = 'persona@correo.com';

create table if not exists public.app_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

-- Sin políticas: solo la service role (worker) y funciones security definer pueden leerla o escribirla
alter table public.app_users enable row level security;

-- Quien ya existe conserva el acceso (si no, te quedarías fuera al aplicar esta migración)
insert into public.app_users (user_id, note)
select id, 'usuario existente al aplicar la migración 0013'
from auth.users
on conflict (user_id) do nothing;

create or replace function public.is_app_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_users where user_id = auth.uid());
$$;

-- En Supabase las funciones nuevas de "public" ya nacen ejecutables por anon: se quita explícitamente
revoke all on function public.is_app_user() from public, anon;
grant execute on function public.is_app_user() to authenticated;

-- Se reemplazan las políticas "para cualquier autenticado" por "solo usuarios autorizados"
do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'sources', 'leads', 'lead_events', 'clients', 'projects', 'project_milestones',
    'features', 'quotes', 'quote_items', 'message_templates', 'site_audits'
  ] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_app_user()) with check (public.is_app_user())',
      'app users all ' || t, t
    );
  end loop;

  -- job_runs: el dashboard solo lee (el worker escribe con la service role)
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'job_runs' loop
    execute format('drop policy %I on public.job_runs', p.policyname);
  end loop;
  execute 'create policy "app users read job_runs" on public.job_runs for select to authenticated using (public.is_app_user())';
end $$;
