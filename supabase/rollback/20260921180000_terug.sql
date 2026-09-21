-- Terugdraaien van 20260921180000_spoed_token_lezen.sql
-- Let op: hierna kan de Edge Function whatsapp-spoed het token niet meer
-- nakijken en weigert hij elke aanroep. Zet dan eerst de taak stil:
--   select cron.unschedule('spoedmelding');

begin;
drop function if exists public.bwf_spoed_token();
commit;
