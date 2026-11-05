# Seguridad

Guía de cómo está protegido Prospecta y qué debes mantener tú.

## Quién puede entrar

- **Lista de usuarios autorizados** (`public.app_users`, migración `0013`): solo esas cuentas leen o escriben datos. Aunque el registro de Supabase esté abierto, una cuenta nueva **no** ve nada.
- Para dar acceso a otra persona: primero créala en Supabase → *Authentication → Users* y luego, en el SQL Editor:
  ```sql
  insert into public.app_users (user_id, note)
  select id, 'socio' from auth.users where email = 'persona@correo.com';
  ```
  Para quitarlo: `delete from public.app_users where user_id = '...';`.
- **Cierra el registro público**: Supabase → *Authentication → Sign In / Providers* → desactiva **Allow new users to sign up**. La lista anterior ya protege los datos, pero no hay razón para dejar que cualquiera cree cuentas.
- El acceso anónimo no lee ninguna tabla. Solo puede ejecutar dos funciones de la cotización pública (`public_quote`, `accept_public_quote`), que exigen un token secreto de 244 bits y no devuelven ids internos.

## Secretos

| Secreto | Dónde vive | Nunca en |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `DENUE_TOKEN`, `REDIS_URL` | Variables del servicio `worker` en Railway, secretos de GitHub Actions, secretos del Worker de Cloudflare y `apps/worker/.env` (local) | Git, Vercel, el navegador |
| `WEBHOOK_SECRET` | Secreto del Worker de Cloudflare (*Runtime*) | Git, Vercel, Railway |
| `APIFY_TOKEN` | Solo `apps/worker/.env` (local) | Railway, Vercel, Git |
| `NEXT_PUBLIC_SUPABASE_*` (llave *publishable*) | Vercel y `apps/web/.env.local` | — (es pública por diseño: la protege RLS) |

Los archivos `.env*` están en `.gitignore`; solo se versionan las plantillas `.env.example` sin valores. Si algún secreto se expone, **rótalo** (Supabase → API Keys, @BotFather `/revoke`, INEGI, Apify, Railway → regenerar contraseña de Redis).

## Protecciones de la web

- Cabeceras: `Content-Security-Policy` (solo la propia app, tu Supabase y las teselas de OpenStreetMap), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, y HSTS (Vercel). Sin `X-Powered-By`.
- El CSP permite `'unsafe-inline'` en scripts porque Next inyecta código de hidratación; usar *nonces* obligaría a renderizar todo de forma dinámica. El resto del CSP es estricto.
- La cotización pública (`/q/<token>`): sin Referer, sin caché y sin indexar.
- Todas las Server Actions verifican sesión; la única pública (`acceptQuote`) depende del token secreto.
- `robots.txt` bloquea a los buscadores.

## Protecciones del worker

- La revisión de sitios web bloquea direcciones privadas o internas (SSRF) en la URL, en redirecciones y en cada recurso; respeta `robots.txt`; una sola página y bajo demanda.
- El bot de Telegram solo atiende al chat de `TELEGRAM_CHAT_ID`.
- El webhook del Worker de Cloudflare exige el encabezado secreto de Telegram (`WEBHOOK_SECRET`, comparado en tiempo constante); sin él responde 401 y no procesa nada. `/setup` también exige esa clave.
- Redis solo es accesible por la red privada de Railway.

## Antes de dar por cerrado un cambio

`npm run lint`, `npx tsc --noEmit` y `npx next build` en `apps/web`; `npx tsc --noEmit` en `apps/worker`; `npm audit --omit=dev` (debe dar 0).
