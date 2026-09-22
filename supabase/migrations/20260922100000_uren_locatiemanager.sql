-- Locatiemanagers hun eigen uren laten zien en invoeren
-- ---------------------------------------------------------------------------
-- Angela, 22-09-2026: "kan je onderaan de pagina urenregistratie toevoegen;
-- iedere gebruiker ziet zijn eigen urenregistratie."
--
-- Het scherm staat klaar, maar de database liet het niet toe. De regel uit
-- 20260911120300_fase1_rechten.sql zegt nu letterlijk:
--
--   eigenaar alles, VR alleen eigen regels, locatiemanager niets
--
-- Jerry, Ruth en Michel kregen daardoor een lege lijst en konden niets
-- opslaan. Deze migratie zet er één rol bij, met dezelfde beperking als de
-- vr-assistenten al hadden: alleen je eigen regels.
--
-- WAT ER VERANDERT
--   was: eigenaar = alles | vr = eigen regels | locatiemanager = niets
--   nu:  eigenaar = alles | vr = eigen regels | locatiemanager = eigen regels
--
-- Een locatiemanager ziet dus NIET wat een collega heeft geschreven, en kan
-- ook niet op naam van een ander iets invoeren: de with check-regel houdt
-- tegen dat je een regel wegschrijft met het medewerker_id van iemand anders.
--
-- Niets wordt verwijderd; er wordt één policy vervangen door dezelfde policy
-- met een rol erbij.

begin;

drop policy if exists "bwf rechten werkzaamheden" on public.wz_werkzaamheden;

create policy "bwf rechten werkzaamheden" on public.wz_werkzaamheden
  as restrictive for all to authenticated
  using (
    (select public.bwf_toegangsrol()) = 'eigenaar'
    or ((select public.bwf_toegangsrol()) in ('vr', 'locatiemanager')
        and medewerker_id = (select public.bwf_medewerker_id()))
  )
  with check (
    (select public.bwf_toegangsrol()) = 'eigenaar'
    or ((select public.bwf_toegangsrol()) in ('vr', 'locatiemanager')
        and medewerker_id = (select public.bwf_medewerker_id()))
  );

commit;

-- Terugdraaien: zie rollback/20260922100000_terug.sql
