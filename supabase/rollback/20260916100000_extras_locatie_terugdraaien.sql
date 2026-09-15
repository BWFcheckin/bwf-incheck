-- TERUGDRAAIEN van 20260916100000_extras_locatie.sql
--
-- Verwijdert de kolom locatie uit wz_extras. Daarmee zijn alle extra's weer
-- overal beschikbaar, zoals vóór 16-09-2026.
--
-- Er gaat geen product verloren: namen, prijzen, omschrijvingen, categorieen en
-- de actief-vlag blijven volledig intact. Alleen de vestigingsindeling verdwijnt.
--
-- Wil je die indeling bewaren, draai dan eerst deze regel en bewaar de uitvoer:
--   select naam, locatie from public.wz_extras where locatie is not null;
--
-- Uitvoeren met:
--   supabase db query --linked -f supabase/rollback/20260916100000_extras_locatie_terugdraaien.sql

begin;

alter table public.wz_extras drop column if exists locatie;

commit;
