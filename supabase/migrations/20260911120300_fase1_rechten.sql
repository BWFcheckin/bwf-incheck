-- Fase 1 · migratie 4/4 — rechten (RLS) volgens de matrix in §5 van het plan
-- Nieuwe tabellen: gewone policies.
-- Bestaande tabellen (checkins, wz_taken, voorraad, wz_werkzaamheden): alleen RESTRICTIVE policies erbij.
-- De bestaande policies blijven staan; een restrictive policy werkt als extra voorwaarde.
-- Terugdraaien = alleen de policies uit dit bestand droppen.
-- LET OP: vanaf nu zien accounts zonder toegangsrol (migratie 3) geen incheckformulieren,
-- taken, voorraad en werkzaamheden meer. Voer deze migratie pas uit na migratie 3.
begin;

-- Hulpfuncties: wie is de ingelogde medewerker?
create or replace function public.bwf_toegangsrol()
returns text
language sql stable security definer
set search_path = ''
as $$
  select m.toegangsrol from public.wz_medewerkers m
   where m.auth_id = auth.uid() and m.toegangsrol is not null
   limit 1
$$;

create or replace function public.bwf_medewerker_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select m.id from public.wz_medewerkers m
   where m.auth_id = auth.uid() and m.toegangsrol is not null
   limit 1
$$;

create or replace function public.bwf_mag_suite(p_suite text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.wz_medewerkers m
     where m.auth_id = auth.uid()
       and (m.toegangsrol in ('eigenaar', 'vr')
            or (m.toegangsrol = 'locatiemanager' and public.bwf_suite(p_suite) = any (m.suites)))
  )
$$;

revoke all on function public.bwf_toegangsrol(), public.bwf_medewerker_id(), public.bwf_mag_suite(text) from public, anon;
grant execute on function public.bwf_toegangsrol(), public.bwf_medewerker_id(), public.bwf_mag_suite(text) to authenticated, service_role;

-- ---------- nieuwe tabellen ----------

-- tijdsblokken: iedereen met een toegangsrol leest, alleen eigenaar beheert
create policy "tijdsblokken lezen" on public.tijdsblokken
  for select to authenticated using ((select public.bwf_toegangsrol()) is not null);
create policy "tijdsblokken beheren" on public.tijdsblokken
  for all to authenticated
  using ((select public.bwf_toegangsrol()) = 'eigenaar')
  with check ((select public.bwf_toegangsrol()) = 'eigenaar');

-- kanaal_instellingen: alleen eigenaar
create policy "kanaalinstellingen eigenaar" on public.kanaal_instellingen
  for all to authenticated
  using ((select public.bwf_toegangsrol()) = 'eigenaar')
  with check ((select public.bwf_toegangsrol()) = 'eigenaar');

-- reserveringen: bekijken per suite; aanmaken en bewerken VR en eigenaar; geen delete (annuleren = status)
create policy "reserveringen lezen" on public.reserveringen
  for select to authenticated using (public.bwf_mag_suite(suite));
create policy "reserveringen aanmaken" on public.reserveringen
  for insert to authenticated with check ((select public.bwf_toegangsrol()) in ('eigenaar', 'vr'));
create policy "reserveringen bewerken" on public.reserveringen
  for update to authenticated
  using ((select public.bwf_toegangsrol()) in ('eigenaar', 'vr'))
  with check ((select public.bwf_toegangsrol()) in ('eigenaar', 'vr'));

-- blokkades: bekijken per suite; beheren VR en eigenaar
create policy "blokkades lezen" on public.blokkades
  for select to authenticated using (public.bwf_mag_suite(suite));
create policy "blokkades beheren" on public.blokkades
  for all to authenticated
  using ((select public.bwf_toegangsrol()) in ('eigenaar', 'vr'))
  with check ((select public.bwf_toegangsrol()) in ('eigenaar', 'vr'));

-- voorraad_mutaties: logboek, alleen lezen en toevoegen
create policy "voorraadmutaties lezen" on public.voorraad_mutaties
  for select to authenticated using ((select public.bwf_toegangsrol()) is not null);
create policy "voorraadmutaties toevoegen" on public.voorraad_mutaties
  for insert to authenticated with check ((select public.bwf_toegangsrol()) is not null);

-- ---------- bestaande tabellen: extra voorwaarden (restrictive) ----------

-- checkins: alleen met toegangsrol; locatiemanager alleen eigen suites
create policy "bwf rechten checkins" on public.checkins
  as restrictive for all to authenticated
  using (public.bwf_mag_suite(locatie))
  with check (public.bwf_mag_suite(locatie));

-- wz_taken: iedereen met toegangsrol mag lezen en aanmaken;
-- afvinken/wijzigen/verwijderen: VR en eigenaar alles, locatiemanager alleen eigen taken
create policy "bwf rechten taken lezen" on public.wz_taken
  as restrictive for select to authenticated
  using ((select public.bwf_toegangsrol()) is not null);
create policy "bwf rechten taken aanmaken" on public.wz_taken
  as restrictive for insert to authenticated
  with check ((select public.bwf_toegangsrol()) is not null);
create policy "bwf rechten taken wijzigen" on public.wz_taken
  as restrictive for update to authenticated
  using ((select public.bwf_toegangsrol()) in ('eigenaar', 'vr')
         or medewerker_id = (select public.bwf_medewerker_id())
         or aangemaakt_door = (select public.bwf_medewerker_id()))
  with check ((select public.bwf_toegangsrol()) is not null);
create policy "bwf rechten taken verwijderen" on public.wz_taken
  as restrictive for delete to authenticated
  using ((select public.bwf_toegangsrol()) in ('eigenaar', 'vr')
         or medewerker_id = (select public.bwf_medewerker_id())
         or aangemaakt_door = (select public.bwf_medewerker_id()));

-- voorraad: iedereen met toegangsrol mag bekijken en aanpassen
create policy "bwf rechten voorraad" on public.voorraad
  as restrictive for all to authenticated
  using ((select public.bwf_toegangsrol()) is not null)
  with check ((select public.bwf_toegangsrol()) is not null);

-- wz_werkzaamheden: eigenaar alles, VR alleen eigen regels, locatiemanager niets
create policy "bwf rechten werkzaamheden" on public.wz_werkzaamheden
  as restrictive for all to authenticated
  using ((select public.bwf_toegangsrol()) = 'eigenaar'
         or ((select public.bwf_toegangsrol()) = 'vr' and medewerker_id = (select public.bwf_medewerker_id())))
  with check ((select public.bwf_toegangsrol()) = 'eigenaar'
         or ((select public.bwf_toegangsrol()) = 'vr' and medewerker_id = (select public.bwf_medewerker_id())));

-- ---------- storage: bucket reservering-bijlagen ----------
create policy "bijlagen lezen" on storage.objects
  for select to authenticated
  using (bucket_id = 'reservering-bijlagen' and (select public.bwf_toegangsrol()) is not null);
create policy "bijlagen uploaden" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'reservering-bijlagen' and (select public.bwf_toegangsrol()) in ('eigenaar', 'vr'));
create policy "bijlagen wijzigen" on storage.objects
  for update to authenticated
  using (bucket_id = 'reservering-bijlagen' and (select public.bwf_toegangsrol()) in ('eigenaar', 'vr'));
create policy "bijlagen verwijderen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'reservering-bijlagen' and (select public.bwf_toegangsrol()) = 'eigenaar');

commit;
