-- ===========================================================================
--  uren_registratie dichtzetten - stap 2 van 2
--  Angela, 06-10-2026
-- ===========================================================================
--  DRAAI DIT PAS als de controle van stap 1
--  (20261006140000_uren_registratie_koppelen.sql) bij elke naam
--  "zonder_account = 0" gaf.
--
--  WAT ER VERANDERT
--    was: iedereen die kan inloggen leest en wijzigt alle urenstaten
--    nu:  eigenaar = alles | iedere andere rol = alleen de eigen regels
--
--  Dezelfde opzet als bij wz_werkzaamheden en psm_administratie, zodat er één
--  manier van denken is.
--
--  LET OP, DIT RAAKT DE INLOG VAN uren-ruth.html
--  Die pagina logde in met een gedeeld account (uren@bedenwellnessflevoland.nl)
--  en een toegangscode. Dat account hoort bij niemand, dus
--  bwf_medewerker_id() geeft daar niets terug en na deze migratie zou de
--  pagina leeg blijven. Daarom logt die pagina nu in met het eigen
--  e-mailadres en wachtwoord, en leent hij in het dashboard de inlog die er al
--  is. Zet deze migratie dus pas als die nieuwe versie live staat - dat is zo
--  sinds dezelfde oplevering.
--
--  Er wordt niets verwijderd; er worden vier policies vervangen door één.
-- ===========================================================================

begin;

-- Veiligheidsrem: weigeren zolang er regels zonder account zijn.
do $$
declare
  los integer;
begin
  select count(*) into los
    from public.uren_registratie
   where medewerker_id is null;
  if los > 0 then
    raise exception
      'Er staan nog % urenregels zonder medewerker_id. Draai eerst stap 1 en de controle daaronder.', los;
  end if;
end $$;

-- De vier open policies eruit. De namen zoals ze in de database staan; staat
-- er bij jou een andere naam, dan doet die regel niets en blijft die policy
-- staan - de controle onderaan laat dat zien.
drop policy if exists "uren_registratie select" on public.uren_registratie;
drop policy if exists "uren_registratie insert" on public.uren_registratie;
drop policy if exists "uren_registratie update" on public.uren_registratie;
drop policy if exists "uren_registratie delete" on public.uren_registratie;
drop policy if exists "ingelogd lezen en schrijven" on public.uren_registratie;
drop policy if exists "bwf rechten uren registratie" on public.uren_registratie;

-- Alles wat er nog staat en niet van ons is, er ook af: één regel is genoeg
-- en twee permissive policies naast elkaar maken het ruimer, niet strakker.
do $$
declare
  p record;
begin
  for p in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'uren_registratie'
  loop
    execute format('drop policy %I on public.uren_registratie', p.policyname);
  end loop;
end $$;

create policy "bwf rechten uren registratie" on public.uren_registratie
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
-- select policyname, cmd from pg_policies
--  where schemaname = 'public' and tablename = 'uren_registratie';
--
--  Daarna de echte proef: laat Ruth haar urenstaat openen (zij ziet haar eigen
--  regels), en laat Jerry of Michel hetzelfde doen (die horen niets te zien).
-- ===========================================================================

-- ===========================================================================
--  TERUGDRAAIEN - zie rollback/20261006140100_terug.sql
-- ===========================================================================
