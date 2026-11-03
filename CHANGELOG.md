# Changelog

Cada versión tiene su tag en git (`v0.1.0` … `v1.4.0`).

## 1.4.0: Seguridad y PWA
- **Acceso:** migración `0013` con lista de usuarios autorizados (`app_users`). Antes, cualquiera que se registrara en Supabase habría leído y modificado todos los datos. Pantalla «Tu cuenta no tiene acceso» para cuentas no autorizadas. Ver `SECURITY.md`.
- **Cabeceras:** CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP; la cotización pública sin Referer ni caché; sin `X-Powered-By`; `robots.txt` que bloquea buscadores.
- **PWA:** favicon e ícono de Apple de la marca (antes era el logo de Next), manifest con `id`, categorías, atajos (Mapa, Prospectos, Nueva cotización) y orientación libre; service worker v2; botón «Instalar app» (con instrucciones para iPhone); márgenes seguros para celulares con notch.
- **Corrección:** `/icon`, `/apple-icon` y `/robots.txt` redirigían al login estando sin sesión.
- **Calidad:** ESLint en 0 errores; `shadcn` pasa a `devDependencies` (0 vulnerabilidades en producción); se quita `railway.json` (obsoleto; Railway detecta el Dockerfile).

## 1.3.0: Importar resultados de Google Maps (Apify)
- `npm run import:apify -- <datasetId>` (en `apps/worker`) importa un dataset del Actor `compass/crawler-google-places` como prospectos: nombre, teléfono, dirección, coordenadas (salen en el mapa), giro y una nota con calificación, reseñas y si el perfil de Google está sin reclamar.
- Por defecto solo importa los «ideales» (con contacto, sin sitio web y abiertos); `--all` trae todos los abiertos con contacto; `--dry-run` muestra qué entraría sin escribir.
- Evita duplicados por `placeId` y por teléfono; el score suma tracción por reseñas. El token (`APIFY_TOKEN`) vive solo en `apps/worker/.env`.

## 1.2.1: Corrección del asistente DENUE y guía de mercados
- Corrección: INEGI responde 404 al pedir un **giro** en «todo Nuevo León»; el asistente ahora exige municipio para un giro (la palabra clave sí admite todo el estado).
- README: tabla de mercados con datos reales de DENUE para elegir qué giro explotar.

## 1.2.0: Propuesta por correo en Telegram
- Los avisos de prospectos con correo traen el botón **✉️ Propuesta por correo**; también `/correo nombre` o la palabra `correo` (respondiendo a un aviso).
- El bot manda el correo ya escrito con la plantilla de correo por defecto: asunto y texto copiables, y botones para abrirlo redactado en **Gmail** o **Outlook** (Telegram no admite botones `mailto:`).
- Incluye el botón «Ya lo envié (marcar contactado)», que además agenda el seguimiento. Si la plantilla usa `{{hallazgo}}`, toma el resultado de la revisión del sitio.

## 1.1.0: Íconos Lucide y todo en pesos (MXN)
- Los emojis usados como íconos en la web se reemplazaron por íconos de [Lucide](https://lucide.dev) (bitácora, cotizaciones, filtros, revisión del sitio y popup del mapa). Los mensajes de Telegram conservan emojis, porque Telegram no muestra íconos SVG.
- Moneda fija en **MXN** con formato mexicano (`$1,500.00`): se quitaron los selectores de moneda de cotizaciones y proyectos; el bot y el dashboard muestran siempre pesos. Migración `0012` (valor por defecto MXN).
- Corrección: las fechas sin hora (vigencia de cotización, inicio y entrega de proyectos) se mostraban un día antes por la zona horaria.
- El ejemplo de catálogo (`0005`) usa precios de muestra en pesos.

## 1.0.0

Primera versión estable. Sin cambios de código respecto a 0.17.0: se fijan las versiones de `apps/web` y `apps/worker` en 1.0.0 y se documenta el historial.

## 0.17.0: Revisión del sitio web
- Auditor móvil con Playwright (HTTPS, certificado, adaptación a celular, velocidad, peso, SEO básico, contacto, captura) y salud del sitio de 0 a 100.
- Argumento de venta (`{{hallazgo}}`) para las plantillas; tarjeta en el prospecto, botón 🔎, `/sitio` y palabra clave en Telegram.
- Seguridad: bloqueo de direcciones privadas/internas (SSRF), `robots.txt`, una página y bajo demanda.
- Migración `0011`.

## 0.16.0: Mapa y ubicación
- DENUE guarda dirección y coordenadas; mapa con filtros, popup, «Mi ubicación» y planeador de rutas (hasta 9 paradas).
- Migración `0010`.

## 0.15.0: Asistente DENUE
- Crear fuentes por giro y municipio (los 51 de Nuevo León) sin escribir URLs ni JSON.

## 0.14.0: Cotización pública
- Enlace `/q/<token>` para que el cliente vea y acepte; avisos de Telegram al abrir y al aceptar; al aceptar se gana el prospecto y se crean cliente y proyecto.
- Migración `0009`.

## 0.13.0: Plantillas de WhatsApp y correo
- Plantillas con variables y botón «Abrir WhatsApp con mensaje» (dashboard y Telegram). Migración `0008`.

## 0.12.0: Seguimientos y resumen diario
- Fecha de seguimiento por prospecto, filtro «Por seguir» y resumen diario por Telegram. Migración `0007`.

## 0.11.0: Control desde Telegram
- Botones, palabras clave y comandos para cambiar el estado de los prospectos.

## 0.10.0: Fuente DENUE de INEGI
- Paginación, filtros, score automático y avisos agrupados. Migración `0006`.

## 0.9.0: Catálogo y cotizaciones
- Catálogo de features y cotizador con total en vivo, documento imprimible y migraciones `0004` y `0005`.

## 0.8.0: Clientes, proyectos y cierres
- Clientes con proyectos e hitos, y pantalla de cierres. Migración `0003`.

## 0.7.0: Prospectos, pipeline y fuentes
- Lista, detalle y bitácora; kanban; gestión de fuentes con «Ejecutar ahora». Migración `0002`.

## 0.6.0: Rediseño y PWA
- Montserrat, shell responsivo, PWA instalable y Resumen con insights.

## 0.5.0 – 0.1.0: Base
- Dockerfile del worker y guía de despliegue (0.5), dashboard inicial (0.4), worker con BullMQ, cron y Telegram (0.3), esquema de base de datos y Redis (0.2), web con Next.js y Supabase (0.1).
