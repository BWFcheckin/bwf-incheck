-- TERUGDRAAIEN van 20260916160000_kanaal_telefonisch_whatsapp.sql
--
-- Zet de toegestane kanalen terug op de zes van vóór 16-09-2026.
--
-- Reserveringen die inmiddels 'telefonisch' of 'whatsapp' zijn, worden eerst
-- op 'handmatig' gezet. Zonder die stap weigert de oude beperking en mislukt
-- het terugdraaien. Er gaat geen reservering verloren, maar de herkomst van
-- die boekingen is daarna niet meer te zien: telefonisch en WhatsApp vallen
-- dan weer samen met alle andere handmatige boekingen.
--
-- Wil je die herkomst bewaren, draai dan eerst deze regel en bewaar de uitvoer:
--   select id, kanaal, aankomst, gast_achternaam from public.reserveringen
--    where kanaal in ('telefonisch','whatsapp');
--
-- Uitvoeren met:
--   supabase db query --linked -f supabase/rollback/20260916160000_kanaal_telefonisch_whatsapp_terugdraaien.sql

begin;

update public.reserveringen
   set kanaal = 'handmatig'
 where kanaal in ('telefonisch', 'whatsapp');

alter table public.reserveringen
  drop constraint if exists reserveringen_kanaal_check;

alter table public.reserveringen
  add constraint reserveringen_kanaal_check
  check (kanaal in ('smg', 'oo', 'booking', 'planyo', 'eigen', 'handmatig'));

commit;
