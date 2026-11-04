-- Catálogo de features y cotizaciones

create table public.features (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  category    text not null default 'General',
  price       numeric(12,2) not null default 0,
  hours       numeric(8,2),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index features_category_idx on public.features (category, name);

create table public.quotes (
  id               uuid primary key default gen_random_uuid(),
  number           int generated always as identity unique,
  title            text not null,
  lead_id          uuid references public.leads(id) on delete set null,
  client_id        uuid references public.clients(id) on delete set null,
  -- datos del destinatario al momento de cotizar (el documento no cambia si luego editas al cliente)
  customer_name    text not null,
  customer_company text,
  customer_email   text,
  status           text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected')),
  currency         text not null default 'USD',
  discount_pct     numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  tax_pct          numeric(5,2) not null default 0 check (tax_pct between 0 and 100),
  valid_until      date,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index quotes_status_idx on public.quotes (status, created_at desc);
create index quotes_lead_idx on public.quotes (lead_id);
create index quotes_client_idx on public.quotes (client_id);

create table public.quote_items (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.quotes(id) on delete cascade,
  feature_id  uuid references public.features(id) on delete set null,
  name        text not null,
  description text,
  qty         numeric(10,2) not null default 1 check (qty > 0),
  unit_price  numeric(12,2) not null default 0,
  position    int not null default 0
);
create index quote_items_quote_idx on public.quote_items (quote_id, position);

create trigger quotes_touch before update on public.quotes
for each row execute function public.touch_updated_at();

