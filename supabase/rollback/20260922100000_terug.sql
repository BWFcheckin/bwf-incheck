-- Terugdraaien van 20260922100000_uren_locatiemanager.sql
-- Zet de regel terug zoals hij was: locatiemanagers mogen dan weer niets met
-- de urenregistratie. Wat er inmiddels is ingevoerd blijft gewoon staan; het
-- wordt alleen onzichtbaar voor die rol.

begin;

drop policy if exists "bwf rechten werkzaamheden" on public.wz_werkzaamheden;

create policy "bwf rechten werkzaamheden" on public.wz_werkzaamheden
  as restrictive for all to authenticated
  using ((select public.bwf_toegangsrol()) = 'eigenaar'
         or ((select public.bwf_toegangsrol()) = 'vr' and medewerker_id = (select public.bwf_medewerker_id())))
  with check ((select public.bwf_toegangsrol()) = 'eigenaar'
         or ((select public.bwf_toegangsrol()) = 'vr' and medewerker_id = (select public.bwf_medewerker_id())));

commit;
