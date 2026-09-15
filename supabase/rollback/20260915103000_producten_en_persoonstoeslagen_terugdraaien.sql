-- TERUGDRAAIEN van 20260915103000_producten_en_persoonstoeslagen.sql
--
-- Zet de database terug in de staat van vóór 15-09-2026:
--   - de tabel bwf_persoonstoeslagen verdwijnt, met haar twee rechtenregels
--   - de kolommen omschrijving en suite verdwijnen uit bwf_producten
--
-- LET OP: de omschrijvingen en de suite-indeling die in die twee kolommen
-- stonden, gaan hiermee verloren. De producten zelf blijven volledig intact:
-- naam, categorie, prijs, per_persoon, sortering en actief worden niet geraakt,
-- en er wordt geen enkele rij uit bwf_producten verwijderd.
--
-- Wil je die teksten bewaren, draai dan eerst deze regel en bewaar de uitvoer:
--   select naam, categorie, omschrijving, suite from public.bwf_producten
--    where omschrijving is not null or suite is not null;
--
-- De personentoeslagen staan alleen in deze tabel. Na het terugdraaien zijn ze
-- weg en moeten ze opnieuw worden ingevoerd; de bedragen staan in de migratie
-- zelf, dus ze zijn daaruit terug te halen.
--
-- Uitvoeren met:
--   supabase db query --linked -f supabase/rollback/20260915103000_producten_en_persoonstoeslagen_terugdraaien.sql

begin;

drop policy if exists "persoonstoeslagen beheren" on public.bwf_persoonstoeslagen;
drop policy if exists "persoonstoeslagen lezen"   on public.bwf_persoonstoeslagen;

drop table if exists public.bwf_persoonstoeslagen;

alter table public.bwf_producten drop column if exists suite;
alter table public.bwf_producten drop column if exists omschrijving;

commit;
