-- Terugdraaien van 20260921160000_spoedmelding_whatsapp.sql
-- Let op: hiermee gaat de administratie van verstuurde meldingen weg. Exporteer
-- de tabel eerst als je wilt weten wat er verstuurd is:
--   \copy public.meldingen_verstuurd to 'exports/meldingen_verstuurd.csv' csv header

begin;
drop table if exists public.meldingen_verstuurd;
commit;
