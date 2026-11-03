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

1. **Base de datos**: en el SQL Editor de Supabase ejecuta, en orden, los archivos de `supabase/migrations/`:
   `0001_init` → `0002_lead_management` → `0003_clients_projects` → `0004_catalog_quotes` (y, opcional, `0005_seed_features_example` con features de ejemplo). Crea un usuario en Authentication → Users.
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

## Qué incluye el dashboard

| Sección | Para qué sirve |
| --- | --- |
| Resumen | Saludo con lo que hay que atender, métricas, embudo, prospectos por día, mejores fuentes y actividad del bot |
| Prospectos | Lista con búsqueda y filtros, alta manual, detalle con bitácora y notas |
| Pipeline | Kanban con arrastrar y soltar entre etapas |
| Cierres | Qué se concretó y qué no, tasa de cierre, valor ganado y motivos de pérdida |
| Cotizaciones | Cotizador: eliges las features que pidió el cliente y se calcula el total; imprime/PDF o copia el resumen |
| Catálogo | Features con precio que alimentan las cotizaciones |
| Clientes | Proyectos con hitos y avance; se crean solos al ganar un prospecto o a mano |
| Fuentes | Crear, editar, pausar y "ejecutar ahora" las fuentes del bot |

Es una PWA: se puede instalar en el celular o escritorio. Variable opcional en Vercel: `NEXT_PUBLIC_BUSINESS_NAME` (nombre que aparece en las cotizaciones).

## Cómo funciona

- Cada fila de `sources` con `enabled = true` y `cron` definido se programa como cron job en BullMQ.
- El worker ejecuta el colector según `kind` (`api` o `web`), inserta prospectos sin duplicar (por email o sitio web), registra la ejecución en `job_runs` y avisa por Telegram.
- El dashboard lee todo desde Supabase con RLS (solo usuarios autenticados).

## Prospectos reales de Nuevo León (DENUE de INEGI)

[DENUE](https://www.inegi.org.mx/servicios/api_denue.html) es el directorio oficial y gratuito de negocios de México (nombre, giro, teléfono, correo, sitio web). Pasos:

1. Solicita un token gratuito de DENUE en INEGI y agrégalo como variable `DENUE_TOKEN` en el servicio del worker (Railway). El token no se guarda en la base de datos.
2. Ejecuta `supabase/migrations/0006_lead_external_id.sql`.
3. En **Fuentes → Nueva fuente** crea una fuente tipo API:
   - **URL:** `https://www.inegi.org.mx/app/api/denue/v1/consulta/BuscarEntidad/dentista/19/{{from}}/{{to}}/{{env.DENUE_TOKEN}}` (`19` = Nuevo León; cambia `dentista` por el giro que buscas)
   - **Cron:** por ejemplo `0 */3 * * *`
   - **Configuración:**
     ```json
     {"pageSize":50,"filter":{"requireAny":["email","phone"],"missing":["website"]},"map":{"external_id":"Id","name":"Nombre","company":"Razon_social","email":"Correo_e","phone":"Telefono","website":"Sitio_internet","city":"Ubicacion","notes":"Clase_actividad"}}
     ```

Cada ejecución trae la siguiente página de `pageSize` registros (el cursor avanza solo y vuelve a empezar al terminar). `filter` guarda solo negocios con teléfono o correo **y sin sitio web** (los mejores prospectos para vender una web). Los prospectos nuevos reciben un score automático (contactable + sin sitio) y llegan a Telegram: hasta 5 avisos individuales por ejecución y un resumen del resto.

Respeta la ley de datos personales (LFPDPPP): contacta negocios con fines comerciales legítimos y atiende cualquier solicitud de no contacto.

## Scraping responsable

El colector web con Playwright solo corre si la fuente tiene `scraping_allowed = true` (revisaste sus términos de uso) **y** `robots.txt` permite la URL para el user-agent del bot. Solo extrae datos de contacto públicos (`mailto:` / `tel:`). Configura `USER_AGENT` con un contacto real.

## Versiones

Se usan tags semánticos: `v0.1.0` base web + auth · `v0.2.0` esquema DB + Redis · `v0.3.0` worker · `v0.4.0` dashboard · `v0.5.0` despliegue (Dockerfile del worker + Railway/Vercel) · `v0.6.0` diseño, PWA y resumen · `v0.7.0` prospectos, pipeline y fuentes · `v0.8.0` clientes, proyectos y cierres · `v0.9.0` catálogo y cotizaciones · `v0.10.0` fuente DENUE (paginación, filtros, score y avisos agrupados).
