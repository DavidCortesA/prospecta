-- Plantillas de mensajes (WhatsApp y correo) con variables: {{nombre}} {{empresa}} {{giro}} {{ciudad}} {{negocio}}

create table public.message_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  channel    text not null check (channel in ('whatsapp', 'email')),
  subject    text,
  body       text not null,
  is_default boolean not null default false,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Una sola plantilla por defecto por canal (la que usa el botón de WhatsApp de Telegram)
create unique index message_templates_default_uniq on public.message_templates (channel) where is_default;

-- Plantillas de ejemplo: edítalas o bórralas desde el dashboard (sección Plantillas)
insert into public.message_templates (name, channel, subject, body, is_default) values
  ('Primer contacto: sin sitio web', 'whatsapp', null,
   E'Hola, buen día. Soy de {{negocio}}. Vi que {{empresa}} en {{ciudad}} aún no cuenta con página web. Nos dedicamos a crear sitios y sistemas para negocios como el suyo. ¿Le gustaría que le comparta una propuesta sin compromiso?',
   true),
  ('Seguimiento', 'whatsapp', null,
   E'Hola, buen día. Le escribo de {{negocio}} para dar seguimiento a mi mensaje anterior sobre la página web de {{empresa}}. ¿Tuvo oportunidad de revisarlo? Con gusto resuelvo cualquier duda.',
   false),
  ('Propuesta de sitio web', 'email', 'Propuesta de página web para {{empresa}}',
   E'Hola, buen día.\n\nSoy de {{negocio}}. Notamos que {{empresa}} en {{ciudad}} todavía no tiene presencia web, y creemos que un sitio sencillo podría ayudarles a recibir más clientes.\n\n¿Les parece si les comparto una propuesta sin compromiso?\n\nQuedo atento,\n{{negocio}}',
   true);
