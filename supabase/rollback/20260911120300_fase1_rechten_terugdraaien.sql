-- Terugdraaien van migratie 4 (20260911120300_fase1_rechten.sql)
-- Gebruik als iemand na migratie 4 is buitengesloten:
--   supabase db query --linked -f supabase/rollback/20260911120300_fase1_rechten_terugdraaien.sql
-- Verwijdert alleen de policies en functies uit migratie 4. Geen gegevens.
-- Daarna gelden op checkins, wz_taken, voorraad en wz_werkzaamheden weer alleen de oude policies;
-- de nieuwe tabellen (reserveringen, blokkades, tijdsblokken, kanaal_instellingen, voorraad_mutaties)
-- zijn dan weer dicht voor de website, zoals na migratie 1. Migraties 1–3 blijven staan.
begin;

-- nieuwe tabellen
drop policy if exists "tijdsblokken lezen"          on public.tijdsblokken;
drop policy if exists "tijdsblokken beheren"        on public.tijdsblokken;
drop policy if exists "kanaalinstellingen eigenaar" on public.kanaal_instellingen;
drop policy if exists "reserveringen lezen"         on public.reserveringen;
drop policy if exists "reserveringen aanmaken"      on public.reserveringen;
drop policy if exists "reserveringen bewerken"      on public.reserveringen;
drop policy if exists "blokkades lezen"             on public.blokkades;
drop policy if exists "blokkades beheren"           on public.blokkades;
drop policy if exists "voorraadmutaties lezen"      on public.voorraad_mutaties;
drop policy if exists "voorraadmutaties toevoegen"  on public.voorraad_mutaties;

-- bestaande tabellen (restrictive)
drop policy if exists "bwf rechten checkins"          on public.checkins;
drop policy if exists "bwf rechten taken lezen"       on public.wz_taken;
drop policy if exists "bwf rechten taken aanmaken"    on public.wz_taken;
drop policy if exists "bwf rechten taken wijzigen"    on public.wz_taken;
drop policy if exists "bwf rechten taken verwijderen" on public.wz_taken;
drop policy if exists "bwf rechten voorraad"          on public.voorraad;
drop policy if exists "bwf rechten werkzaamheden"     on public.wz_werkzaamheden;

-- storage
drop policy if exists "bijlagen lezen"       on storage.objects;
drop policy if exists "bijlagen uploaden"    on storage.objects;
drop policy if exists "bijlagen wijzigen"    on storage.objects;
drop policy if exists "bijlagen verwijderen" on storage.objects;

-- hulpfuncties (na de policies, die ervan afhangen)
drop function if exists public.bwf_mag_suite(text);
drop function if exists public.bwf_medewerker_id();
drop function if exists public.bwf_toegangsrol();

commit;
