-- Todo el sistema trabaja en pesos mexicanos (MXN)

alter table public.quotes   alter column currency set default 'MXN';
alter table public.projects alter column currency set default 'MXN';

update public.quotes   set currency = 'MXN' where currency <> 'MXN';
update public.projects set currency = 'MXN' where currency <> 'MXN';
