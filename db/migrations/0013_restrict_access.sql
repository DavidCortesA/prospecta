-- Acceso restringido a usuarios autorizados.
--
-- Lista de personas que pueden entrar al dashboard. El usuario debe existir primero en el proveedor de
-- autenticación; luego se agrega su id (el `sub` de su sesión) a esta tabla:
--   insert into public.app_users (user_id, note) values ('<uuid del usuario>', 'socio');
--
-- Neon no tiene RLS de Supabase: la app comprueba esta tabla en `requireUser` (apps/web/lib/auth.ts)
-- y el worker escribe con su propia conexión. Sin una fila aquí, nadie entra al dashboard.

create table if not exists public.app_users (
  user_id    uuid primary key,
  note       text,
  created_at timestamptz not null default now()
);
