-- Clientes (prospectos que se concretaron o clientes que ya tenías) y el proceso de sus proyectos

create table public.clients (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid unique references public.leads(id) on delete set null,
  name       text not null,
  company    text,
  email      text,
  phone      text,
  website    text,
  notes      text,
  created_at timestamptz not null default now()
);

create table public.projects (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  name       text not null,
  status     text not null default 'onboarding'
             check (status in ('onboarding', 'design', 'development', 'review', 'delivered', 'paused')),
  budget     numeric(12,2),
  currency   text not null default 'USD',
  start_date date,
  due_date   date,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_client_idx on public.projects (client_id);

create table public.project_milestones (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title      text not null,
  done       boolean not null default false,
  due_date   date,
  position   int not null default 0,
  created_at timestamptz not null default now()
);
create index milestones_project_idx on public.project_milestones (project_id, position);

create trigger projects_touch before update on public.projects
for each row execute function public.touch_updated_at();

