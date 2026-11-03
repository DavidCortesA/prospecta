-- OPCIONAL: features de ejemplo para probar el cotizador.
-- Los precios son solo de muestra (USD): edítalos o bórralos desde Catálogo en el dashboard.

insert into public.features (name, description, category, price, hours) values
  ('Landing page',                 'Página de una sola sección con diseño a medida, responsive y SEO básico.',          'Web',          600,  20),
  ('Sitio web corporativo',        'Hasta 6 páginas, formulario de contacto, blog opcional y SEO básico.',               'Web',          1500, 60),
  ('Panel administrativo',         'Dashboard con tablas, filtros y gestión de datos.',                                 'Sistemas',     2200, 80),
  ('Login y roles de usuario',     'Autenticación, recuperación de contraseña y permisos por rol.',                      'Sistemas',     450,  16),
  ('PWA (app instalable)',         'Instalable en celular, funciona sin conexión para pantallas clave.',                'Móvil',        500,  16),
  ('Integración de pagos',         'Cobros en línea con pasarela (Stripe, Mercado Pago u otra).',                       'Integraciones', 700, 24),
  ('Integración WhatsApp',         'Botón, mensajes automáticos y notificaciones por WhatsApp Business API.',           'Integraciones', 550, 20),
  ('Notificaciones por Telegram',  'Avisos automáticos de eventos importantes a un chat o grupo.',                      'Integraciones', 250, 8),
  ('Automatización / bot',         'Bot o flujo automatizado que ejecuta tareas recurrentes.',                          'Automatización', 1200, 40),
  ('Capacitación y entrega',       'Sesión de capacitación, manual de uso y 30 días de soporte.',                       'Servicios',    300,  10);
