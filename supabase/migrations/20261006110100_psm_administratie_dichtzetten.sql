-- ===========================================================================
--  psm_administratie dichtzetten - stap 2 van 2
--  Angela, 06-10-2026
-- ===========================================================================
--  DRAAI DIT PAS als de controle van stap 1
--  (20261006110000_psm_administratie_koppelen.sql) bij elke naam
--  "zonder_account = 0" gaf. Staat daar een getal groter dan nul, dan raakt
--  die medewerker na deze migratie zijn eigen regels kwijt - hij ziet ze niet
--  meer en kan ze niet meer wijzigen. De regels blijven bestaan en de eigenaar
--  ziet ze nog, maar het is een vervelende verrassing die we niet nodig hebben.
--
--  WAT ER VERANDERT
--    was: iedereen die kan inloggen leest en wijzigt alle administraties
--    nu:  eigenaar = alles | iedere andere rol = alleen de eigen regels
--
--  Dit is dezelfde opzet als bij wz_werkzaamheden (migratie 20260922100000),
--  zodat er één manier van denken is en niet twee.
--
--  HOE
--  De oude policy "ingelogd lezen en schrijven" wordt vervangen. Een
--  restrictive policy erbij zetten zou niet werken: de oude laat met
--  `using (true)` alles door, en een permissive policy náást een permissive
--  policy maakt het ruimer, niet strakker. Vervangen is hier dus de juiste
--  weg - en de nieuwe policy laat nog steeds iedereen bij zijn eigen regels,
--  dus niemand raakt toegang kwijt tot eigen gegevens.
--
--  LET OP VOOR HET SCHERM
--  administratie-michel.html moet bij het opslaan medewerker_id meesturen,
--  anders weigert de with check-regel de nieuwe regel. Die aanpassing staat in
--  dezelfde oplevering; draai deze migratie pas als die pagina live staat.
--
--  Er wordt niets verwijderd; er verandert één policy.
-- ===========================================================================

begin;

-- Veiligheidsrem: weigeren zolang er regels zonder account zijn. Beter een
-- migratie die stopt met een duidelijke melding dan een medewerker die
-- morgen zijn administratie niet meer kan openen.
do $$
declare
  los integer;
begin
  select count(*) into los
    from public.psm_administratie
   where medewerker_id is null;
  if los > 0 then
    raise exception
      'Er staan nog % regels zonder medewerker_id. Draai eerst stap 1 en de controle daaronder; zet daarna pas deze migratie.', los;
  end if;
end $$;

drop policy if exists "ingelogd lezen en schrijven" on public.psm_administratie;

create policy "bwf rechten psm administratie" on public.psm_administratie
  for all to authenticated
  using (
    (select public.bwf_toegangsrol()) = 'eigenaar'
    or medewerker_id = (select public.bwf_medewerker_id())
  )
  with check (
    (select public.bwf_toegangsrol()) = 'eigenaar'
    or medewerker_id = (select public.bwf_medewerker_id())
  );

commit;

-- ===========================================================================
--  CONTROLE - draai dit erna
-- ===========================================================================
--  Er hoort precies één policy te staan, met de nieuwe naam.
--
-- select policyname, permissive, cmd
--   from pg_policies
--  where schemaname = 'public' and tablename = 'psm_administratie'
--  order by policyname;
--
--  Daarna de echte proef: laat Michel zijn pagina openen (hij ziet zijn eigen
--  regels), en laat één andere locatiemanager hetzelfde doen (die hoort een
--  lege maand te zien).
-- ===========================================================================

-- ===========================================================================
--  TERUGDRAAIEN - zie rollback/20261006110100_terug.sql
-- ===========================================================================
