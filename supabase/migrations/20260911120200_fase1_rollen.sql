-- Fase 1 · migratie 3/4 — toegangsrol en suites per medewerker
-- E-mailadressen bevestigd door Angela op 11-09-2026.
-- Koppeling via wz_medewerkers.id (de rij heeft al een auth_id naar het login-account);
-- e-mailadressen staan bewust niet in dit bestand (publieke repo).
-- Wijzigt alleen toegangsrol en suites; voor Ruth, Michel en Jerry ook actief = true (besluit 11-09-2026).
-- De kolom rol en overige kolommen blijven gelijk.
begin;

update public.wz_medewerkers set toegangsrol = 'eigenaar',
       suites = array['angie', 'malina_jacuzzi', 'malina_deluxe']
 where id = '04e0a31f-fa6e-40e2-a15d-a745b40fd67a';  -- Angela

update public.wz_medewerkers set toegangsrol = 'vr',
       suites = array['angie', 'malina_jacuzzi', 'malina_deluxe']
 where id = '6ab27e72-4f83-4703-ba14-3843f2a1a09e';  -- Kelly

update public.wz_medewerkers set toegangsrol = 'vr',
       suites = array['angie', 'malina_jacuzzi', 'malina_deluxe']
 where id = 'd0978239-053f-45c7-b766-8156f352288a';  -- Senna

update public.wz_medewerkers set toegangsrol = 'locatiemanager', actief = true,
       suites = array['malina_jacuzzi', 'malina_deluxe']
 where id = '25ffe60e-66c7-4ff8-b5a2-4a0fd13ffad4';  -- Ruth

update public.wz_medewerkers set toegangsrol = 'locatiemanager', actief = true,
       suites = array['angie', 'malina_jacuzzi', 'malina_deluxe']
 where id = 'aada3065-0bd3-4e8d-aa43-b6522824fc8b';  -- Michel

update public.wz_medewerkers set toegangsrol = 'locatiemanager', actief = true,
       suites = array['malina_jacuzzi', 'malina_deluxe']
 where id = '5da13ee1-1f56-441d-aa75-c4354bde1730';  -- Jerry

-- Controle: precies deze 6 met toegangsrol én login-account, en alle 6 actief
do $$
begin
  if (select count(*) from public.wz_medewerkers where toegangsrol is not null and auth_id is not null) <> 6 then
    raise exception 'Verwacht 6 medewerkers met toegangsrol én login-account';
  end if;
  if (select count(*) from public.wz_medewerkers where toegangsrol is not null and actief) <> 6 then
    raise exception 'Verwacht 6 actieve medewerkers met toegangsrol';
  end if;
end
$$;

commit;
