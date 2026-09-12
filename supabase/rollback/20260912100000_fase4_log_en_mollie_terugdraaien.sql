-- Terugdraaien van 20260912100000_fase4_log_en_mollie.sql
-- Let op: dit verwijdert de wijzigingslog en de drie nieuwe kolommen op mollie_betalingen.
-- Maak eerst een export (exports/ staat in .gitignore):
--   supabase db query --linked "select * from public.reservering_log"   > exports/reservering-log-voor-terugdraaien.json
--   supabase db query --linked "select * from public.mollie_betalingen" > exports/mollie-betalingen-voor-terugdraaien.json

begin;

drop trigger if exists reserveringen_log on public.reserveringen;
drop function if exists public.bwf_reservering_log();
drop table if exists public.reservering_log;

drop index if exists public.mollie_betalingen_res_idx;
drop index if exists public.mollie_betalingen_call_idx;
alter table public.mollie_betalingen
  drop column if exists reservering_id,
  drop column if exists welkomstcall_id,
  drop column if exists soort;

commit;
