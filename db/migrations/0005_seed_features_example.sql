-- OPCIONAL: features de ejemplo para probar el cotizador.
-- Los precios son solo de muestra (pesos mexicanos, MXN): edítalos o bórralos desde Catálogo en el dashboard.

insert into public.features (name, description, category, price, hours) values
  ('Landing page',                 'Página de una sola sección con diseño a medida, responsive y SEO básico.',          'Web',          12000,  20),
  ('Sitio web corporativo',        'Hasta 6 páginas, formulario de contacto, blog opcional y SEO básico.',               'Web',          30000, 60),
  ('Panel administrativo',         'Dashboard con tablas, filtros y gestión de datos.',                                 'Sistemas',     45000, 80),
  ('Login y roles de usuario',     'Autenticación, recuperación de contraseña y permisos por rol.',                      'Sistemas',     9000,  16),
  ('PWA (app instalable)',         'Instalable en celular, funciona sin conexión para pantallas clave.',                'Móvil',        10000,  16),
  ('Integración de pagos',         'Cobros en línea con pasarela (Stripe, Mercado Pago u otra).',                       'Integraciones', 14000, 24),
  ('Integración WhatsApp',         'Botón, mensajes automáticos y notificaciones por WhatsApp Business API.',           'Integraciones', 11000, 20),
  ('Notificaciones por Telegram',  'Avisos automáticos de eventos importantes a un chat o grupo.',                      'Integraciones', 5000, 8),
  ('Automatización / bot',         'Bot o flujo automatizado que ejecuta tareas recurrentes.',                          'Automatización', 24000, 40),
  ('Capacitación y entrega',       'Sesión de capacitación, manual de uso y 30 días de soporte.',                       'Servicios',    6000,  10);
