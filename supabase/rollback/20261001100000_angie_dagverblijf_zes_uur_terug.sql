-- Terugzetten van 20261001100000_angie_dagverblijf_zes_uur.sql
-- ---------------------------------------------------------------------------
-- Het blok van zes uur gaat op actief = false, niet weg: er kunnen inmiddels
-- reserveringen op gemaakt zijn, en Angela's regel is dat er niets verwijderd
-- wordt. Het verdwijnt hiermee uit de keuzelijst.

begin;

update public.bwf_tariefblokken
   set actief = false
 where suite = 'angie'
   and verblijf = 'dag'
   and starttijd = '12:00'
   and eindtijd = '18:00'
   and actief is distinct from false;

commit;
