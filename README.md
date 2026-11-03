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
   `0001_init` → `0002_lead_management` → `0003_clients_projects` → `0004_catalog_quotes` → `0006_lead_external_id` → `0007_followups` → `0008_message_templates` → `0009_public_quotes` → `0010_lead_location` → `0011_site_audits` (y, opcional, `0005_seed_features_example` con features de ejemplo). Crea un usuario en Authentication → Users.
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
3. **Forma fácil:** en **Fuentes → Asistente DENUE** eliges el giro (dentistas, restaurantes, abogados, talleres…), el municipio de Nuevo León (los 51), la frecuencia y los filtros, y la fuente se arma sola. También puedes usar una palabra clave para giros que no estén en la lista.
   **A mano:** en **Fuentes → Nueva fuente** crea una fuente tipo API:
   - **URL:** `https://www.inegi.org.mx/app/api/denue/v1/consulta/BuscarEntidad/dentista/19/{{from}}/{{to}}/{{env.DENUE_TOKEN}}` (`19` = Nuevo León; cambia `dentista` por el giro que buscas)
   - **Cron:** por ejemplo `0 */3 * * *`
   - **Configuración:**
     ```json
     {"pageSize":50,"filter":{"requireAny":["email","phone"],"missing":["website"]},"map":{"external_id":"Id","name":"Nombre","company":"Razon_social","email":"Correo_e","phone":"Telefono","website":"Sitio_internet","city":"Ubicacion","notes":"Clase_actividad"}}
     ```

Cada ejecución trae la siguiente página de `pageSize` registros (el cursor avanza solo y vuelve a empezar al terminar). `filter` guarda solo negocios con teléfono o correo **y sin sitio web** (los mejores prospectos para vender una web). Los prospectos nuevos reciben un score automático (contactable + sin sitio) y llegan a Telegram: hasta 5 avisos individuales por ejecución y un resumen del resto.

Respeta la ley de datos personales (LFPDPPP): contacta negocios con fines comerciales legítimos y atiende cualquier solicitud de no contacto.

## Controlar los prospectos desde Telegram

Cada aviso de prospecto trae botones (✅ Contactado · 💬 Respondió · ⭐ Calificado · 🏆 Ganado · ❌ Rechazó) y un enlace al dashboard. También puedes **responder al aviso** con una palabra clave:

| Escribe | Efecto |
| --- | --- |
| `contactado` · `respondió` · `calificado` | Cambia el estado |
| `ganado 5000` | Gana el prospecto (valor opcional) y crea cliente y proyecto |
| `rechazó precio alto` | Lo marca perdido con motivo opcional |
| `nota llamar el lunes` | Guarda una nota en la bitácora |

Sin responder a un aviso, escribe la palabra y el nombre: `contactado Pérez`. Comandos: `/pendientes`, `/buscar nombre`, `/resumen`, `/ayuda`.

El bot solo atiende al chat configurado en `TELEGRAM_CHAT_ID`. Variable opcional del worker: `DASHBOARD_URL` (agrega el botón "Abrir en el dashboard").

## Seguimientos y resumen diario

- Cada prospecto tiene una **fecha de seguimiento** (detalle del prospecto, botón ⏰ en Telegram o la palabra `recordar 3`). Al marcarlo **Contactado** se agenda solo en 3 días; al cerrarlo (ganado/perdido) se borra. Lo hace un trigger en la base de datos, así que el dashboard y Telegram se comportan igual.
- En Prospectos hay un filtro **⏰ Por seguir** y el Resumen muestra "Seguimientos de hoy".
- Cada mañana (por defecto 9:00, hora de `APP_TZ`) el bot manda el resumen del día: seguimientos, prospectos sin contactar y cotizaciones esperando respuesta, con botones. `/seguimientos` lo pide en cualquier momento.
- Variables opcionales del worker: `APP_TZ` (por defecto `America/Mexico_City`) y `DIGEST_CRON` (por defecto `0 9 * * *`).

## Plantillas de WhatsApp y correo

En **Plantillas** guardas mensajes con variables (`{{empresa}}`, `{{nombre}}`, `{{giro}}`, `{{ciudad}}`, `{{negocio}}`) que se llenan solas con los datos de cada prospecto.

- En el detalle del prospecto, la tarjeta **Contactar** abre WhatsApp (o tu correo) con el mensaje ya escrito; tú solo pulsas enviar. Al abrirlo, el prospecto pasa a *Contactado* y se agenda el seguimiento.
- Los avisos de Telegram traen el botón **📲 Abrir WhatsApp con mensaje**, que usa la plantilla de WhatsApp marcada *Por defecto*.
- No se envía nada automáticamente: el mensaje lo envías tú desde tu WhatsApp o correo.
- `{{negocio}}` sale de `NEXT_PUBLIC_BUSINESS_NAME` (Vercel) y `BUSINESS_NAME` (worker). Los teléfonos se normalizan a formato mexicano (`52` + 10 dígitos); un teléfono fijo abrirá WhatsApp pero no recibirá el mensaje.

## Cotización pública (el cliente la acepta con un enlace)

En el detalle de cada cotización hay un **enlace para el cliente** (`/q/<token>`): ve el documento, lo puede imprimir y **aceptarlo** escribiendo su nombre. Sin iniciar sesión.

- Seguridad: el token es largo e impredecible; el acceso anónimo **no lee las tablas**, solo ejecuta dos funciones de la base (`public_quote` y `accept_public_quote`) que exigen ese token y no devuelven ids internos. La página va con `noindex`.
- Telegram te avisa cuando el cliente **abre** el enlace por primera vez y cuando **acepta**. Al aceptar, el prospecto pasa a Ganado y se crea el cliente y su proyecto (lo hace el worker en ~20 s).
- Las vistas previas de WhatsApp/Telegram no cuentan como "abrió", y el botón *Vista previa* del dashboard tampoco.
- Una cotización vencida (`Válida hasta`) o rechazada no se puede aceptar.

## Mapa y rutas de visita

Las fuentes DENUE guardan la **dirección y las coordenadas** de cada negocio. En **Mapa** ves los prospectos como puntos de colores (por estado), filtras por zona o municipio, por estado, por «sin sitio web» o por seguimiento vencido, y abres el popup de cada uno con WhatsApp, ficha y «Cómo llegar».

- **Planear ruta aquí:** toma hasta 9 prospectos abiertos de lo que ves en pantalla (los más cercanos al centro o a *Mi ubicación*), los ordena de cercano a cercano y abre la ruta en Google Maps.
- Los avisos de Telegram traen la dirección y el botón **📍 Cómo llegar**.
- Los prospectos que ya tenías se completan al pulsar **Reiniciar** y **Ejecutar ahora** en tu fuente DENUE: los duplicados por id solo actualizan la ubicación.
- Mapa base de OpenStreetMap (uso ligero; si algún día lo usas mucho, cambia el proveedor de teselas).

## Revisión del sitio web del prospecto

En el detalle de un prospecto con sitio web, **Revisar sitio** (o el botón 🔎 de Telegram, `/sitio nombre`, o responder `sitio` a un aviso) pide al bot que abra la página **como un celular** y te diga qué tan mal está:

- Salud del sitio de 0 a 100, lista de problemas (sin HTTPS, certificado inválido, no adaptado a celular, carga lenta o pesada, sin descripción para Google, sin botón de WhatsApp/llamada, pie de página desactualizado…), métricas y una **captura móvil**.
- Un **argumento de venta** listo, disponible en las plantillas como `{{hallazgo}}` (hay una plantilla de ejemplo, «Sitio con problemas»).
- Los prospectos **sin** sitio web no se revisan: ya son una oportunidad directa.

**Seguridad y permisos** (el sitio revisado es de un tercero):
- Solo se abre **una página, bajo demanda**: nunca de forma masiva ni automática.
- Se respeta `robots.txt`; si el sitio no permite revisiones automáticas, no se revisa.
- El worker **bloquea direcciones privadas o internas** (localhost, redes privadas, metadatos de la nube, `.internal`, puertos distintos de 80/443), en la URL y en cada redirección o recurso de la página, para que nadie pueda usar una URL capturada para llegar a tu Redis u otros servicios.
- Se identifica con tu `USER_AGENT` (ponle un contacto real).

## Scraping responsable

El colector web con Playwright solo corre si la fuente tiene `scraping_allowed = true` (revisaste sus términos de uso) **y** `robots.txt` permite la URL para el user-agent del bot. Solo extrae datos de contacto públicos (`mailto:` / `tel:`). Configura `USER_AGENT` con un contacto real.

## Versiones

Se usan tags semánticos: `v0.1.0` base web + auth · `v0.2.0` esquema DB + Redis · `v0.3.0` worker · `v0.4.0` dashboard · `v0.5.0` despliegue (Dockerfile del worker + Railway/Vercel) · `v0.6.0` diseño, PWA y resumen · `v0.7.0` prospectos, pipeline y fuentes · `v0.8.0` clientes, proyectos y cierres · `v0.9.0` catálogo y cotizaciones · `v0.10.0` fuente DENUE (paginación, filtros, score y avisos agrupados) · `v0.11.0` control de prospectos desde Telegram · `v0.12.0` seguimientos y resumen diario · `v0.13.0` plantillas de WhatsApp y correo · `v0.14.0` cotización pública con aceptar · `v0.15.0` asistente DENUE · `v0.16.0` mapa, ubicación y rutas · `v0.17.0` revisión del sitio web.
