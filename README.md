# Prospecta

Bot de captación de clientes con dashboard.

| Capa | Tecnología |
| --- | --- |
| Frontend | Next.js + React + TypeScript + Tailwind (`apps/web`) |
| Backend / worker | Node.js + TypeScript (`apps/worker`) |
| Automatización | Playwright (solo con permiso, ver abajo) |
| Base de datos | PostgreSQL en Supabase (`supabase/migrations`) |
| Colas | BullMQ + Redis |
| Notificaciones | Telegram Bot API |
| Programación | Cron jobs (BullMQ job schedulers, columna `sources.cron`) |

## Puesta en marcha

1. **Base de datos**: ejecuta `supabase/migrations/0001_init.sql` en el SQL Editor de Supabase y crea un usuario en Authentication → Users.
2. **Redis**: `docker compose up -d`
3. **Web**: copia `apps/web/.env.example` a `.env.local`, completa los valores y ejecuta
   ```bash
   cd apps/web && npm install && npm run dev
   ```
4. **Worker**: copia `apps/worker/.env.example` a `.env` (usa la *service role key*, nunca en el frontend) y ejecuta
   ```bash
   cd apps/worker && npm install && npx playwright install chromium && npm run dev
   ```

## Despliegue

- **Web (`apps/web`) → Vercel.** *Root Directory* = `apps/web`; variables `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- **Worker (`apps/worker`) + Redis → Railway.**
  1. En el proyecto de Railway agrega un servicio Redis (base de datos) y otro servicio desde este repo con *Root Directory* = `apps/worker` (usa el `Dockerfile` y `railway.json`).
  2. Variables del worker: `REDIS_URL` (referencia `${{Redis.REDIS_URL}}`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `USER_AGENT`.
  3. Comprueba que Redis use la política de memoria `noeviction` (requisito de BullMQ).

El Redis puede ser cualquier proveedor: el worker solo lee `REDIS_URL` (usa `rediss://` si es TLS).

## Cómo funciona

- Cada fila de `sources` con `enabled = true` y `cron` definido se programa como cron job en BullMQ.
- El worker ejecuta el colector según `kind` (`api` o `web`), inserta prospectos sin duplicar (por email o sitio web), registra la ejecución en `job_runs` y avisa por Telegram.
- El dashboard lee todo desde Supabase con RLS (solo usuarios autenticados).

## Scraping responsable

El colector web con Playwright solo corre si la fuente tiene `scraping_allowed = true` (revisaste sus términos de uso) **y** `robots.txt` permite la URL para el user-agent del bot. Solo extrae datos de contacto públicos (`mailto:` / `tel:`). Configura `USER_AGENT` con un contacto real.

## Versiones

Se usan tags semánticos: `v0.1.0` base web + auth · `v0.2.0` esquema DB + Redis · `v0.3.0` worker · `v0.4.0` dashboard · `v0.5.0` despliegue (Dockerfile del worker + Railway/Vercel).
