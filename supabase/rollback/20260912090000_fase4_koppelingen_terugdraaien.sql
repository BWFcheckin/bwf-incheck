-- Terugdraaien van 20260912090000_fase4_koppelingen.sql
-- Let op: dit verwijdert de nieuwe kolommen en daarmee wat erin is gezet.
-- Maak eerst een export (exports/ staat in .gitignore):
--   supabase db query --linked "select * from public.reserveringen" > exports/reserveringen-voor-terugdraaien.json
--   supabase db query --linked "select * from public.wz_welkomstcalls" > exports/welkomstcalls-voor-terugdraaien.json

begin;

drop index if exists public.wz_welkomstcalls_reservering_uniek;
alter table public.wz_welkomstcalls
  drop column if exists reservering_id,
  drop column if exists uitkomst;

drop index if exists public.schade_reservering_idx;
alter table public.schade drop column if exists reservering_id;

alter table public.reserveringen
  drop column if exists borg_bedrag,
  drop column if exists borg_wijze,
  drop column if exists borg_ontvangen,
  drop column if exists borg_terug,
  drop column if exists borg_ingehouden,
  drop column if exists borg_afgehandeld,
  drop column if exists borg_notitie,
  drop column if exists betaald_bedrag,
  drop column if exists notitie,
  drop column if exists medewerker,
  drop column if exists geannuleerd_op,
  drop column if exists review_taak_id,
  drop column if exists review_verstuurd,
  drop column if exists gastlink_verstuurd;

-- reserveringen.welkomstcall_id bestond al vóór deze migratie; punt 5 vulde die alleen aan.
-- Terugzetten naar leeg kan met de export hierboven; automatisch leegmaken doen we niet.

commit;
