-- TERUGDRAAIEN van 20260916170000_checkins_betaling_verwerkt.sql
--
-- Verwijdert de drie kolommen weer uit public.checkins.
--
-- LET OP: alles wat er inmiddels is afgevinkt gaat hiermee verloren - welke
-- betalingen verwerkt waren, wanneer en door wie. De incheckformulieren zelf
-- blijven volledig intact: er wordt geen rij verwijderd en geen ander veld
-- aangeraakt.
--
-- Wil je die gegevens bewaren, draai dan eerst deze regel en bewaar de uitvoer:
--   select id, datum, achternaam, betaling_verwerkt, betaling_verwerkt_op,
--          betaling_verwerkt_door
--     from public.checkins where betaling_verwerkt;
--
-- Uitvoeren met:
--   supabase db query --linked -f supabase/rollback/20260916170000_checkins_betaling_verwerkt_terugdraaien.sql

begin;

alter table public.checkins drop column if exists betaling_verwerkt_door;
alter table public.checkins drop column if exists betaling_verwerkt_op;
alter table public.checkins drop column if exists betaling_verwerkt;

commit;
