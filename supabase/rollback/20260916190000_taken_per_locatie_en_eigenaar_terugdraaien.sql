-- Terugdraaien van 20260916190000_taken_per_locatie_en_eigenaar.sql
--
-- Zet de twee policies exact terug zoals ze waren, zodat het gedrag weer is
-- als voor de migratie.
--
-- De kolom wz_taken.locatie en de functie bwf_mag_locatie() blijven bewust
-- staan: weghalen zou ingevulde locaties vernietigen, en ze doen geen kwaad
-- zolang geen enkele policy ernaar kijkt. Wil je ze toch weg, dan staat dat
-- onderaan als los stuk dat je zelf kunt uitvoeren nadat je hebt gecontroleerd
-- dat er niets in de kolom staat wat je nog nodig hebt.

begin;

-- de ruime policy terug zoals hij was: alles toegestaan voor wie is ingelogd
drop policy if exists "wz_taken_ingelogd" on public.wz_taken;
create policy "wz_taken_ingelogd" on public.wz_taken
  for all to authenticated
  using (true)
  with check (true);

-- de leespolicy terug in de oude vorm
drop policy if exists "bwf rechten taken lezen" on public.wz_taken;
create policy "bwf rechten taken lezen" on public.wz_taken
  for select to authenticated
  using ((select public.bwf_toegangsrol()) is not null);

commit;

-- ---------------------------------------------------------------------------
-- NIET automatisch uitgevoerd. Alleen draaien als je zeker weet dat de
-- ingevulde locaties weg mogen:
--
-- alter table public.wz_taken drop constraint if exists wz_taken_locatie_check;
-- alter table public.wz_taken drop column if exists locatie;
-- drop function if exists public.bwf_mag_locatie(text);
