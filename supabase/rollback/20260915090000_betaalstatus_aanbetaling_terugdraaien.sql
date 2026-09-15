-- TERUGDRAAIEN van 20260915090000_betaalstatus_aanbetaling.sql
--
-- Zet de toegestane waarden van reserveringen.betaalstatus terug op de drie
-- waarden van vóór 15-09-2026: 'open', 'deels' en 'betaald'.
--
-- Reserveringen die inmiddels op 'aanbetaling' staan, worden eerst op 'deels'
-- gezet. Zonder die stap weigert de oude beperking en mislukt het terugdraaien.
-- 'deels' betekent hetzelfde: er is een deel betaald. Het bedrag in
-- betaald_bedrag blijft ongemoeid staan, dus er gaat geen informatie verloren.
--
-- Uitvoeren met:
--   supabase db query --linked -f supabase/rollback/20260915090000_betaalstatus_aanbetaling_terugdraaien.sql

begin;

update public.reserveringen
   set betaalstatus = 'deels'
 where betaalstatus = 'aanbetaling';

alter table public.reserveringen
  drop constraint if exists reserveringen_betaalstatus_check;

alter table public.reserveringen
  add constraint reserveringen_betaalstatus_check
  check (betaalstatus in ('open', 'deels', 'betaald'));

commit;
