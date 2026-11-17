-- Arregla las fuentes DENUE creadas con un código SCIAN de 6 dígitos escrito como "palabra clave".
--
-- El asistente lo mandaba en el campo «nombre» de la consulta (…/0/238222/{{from}}…), así que INEGI buscaba negocios
-- LLAMADOS "238222" y respondía "No hay resultados." (un texto, no una lista): de ahí el aviso
-- «La respuesta no es un arreglo». El código va en el campo «clase» (…/238222/0/{{from}}…).
--
-- Es idempotente: solo toca URLs que aún tienen el código en el campo «nombre».

update public.sources
   set url = regexp_replace(url, '/0/(\d{6})/\{\{from\}\}', '/\1/0/{{from}}'),
       config = jsonb_set(coalesce(config, '{}'::jsonb), '{cursor}', '0'::jsonb, true)  -- vuelve a la primera página
 where kind = 'api'
   and url like '%/BuscarAreaAct/%'
   and url ~ '/0/\d{6}/\{\{from\}\}';

-- Nombres legibles para los giros que ya conocemos ("DENUE · 238222 · Monterrey" -> "DENUE · Instalaciones … · Monterrey")
update public.sources
   set name = 'DENUE · ' || case substring(name from '^DENUE · (\d{6}) · ')
        when '811312' then 'Mantenimiento de maquinaria industrial'
        when '332710' then 'Maquinado de piezas metálicas'
        when '332310' then 'Estructuras metálicas (fabricación)'
        when '238210' then 'Instalaciones eléctricas'
        when '238222' then 'Aire acondicionado y calefacción (instalación)'
        when '561710' then 'Control y exterminación de plagas'
        when '561610' then 'Seguridad privada y custodia'
      end || substring(name from '^DENUE · \d{6}( · .+)$')
 where name ~ '^DENUE · (811312|332710|332310|238210|238222|561710|561610) · ';
