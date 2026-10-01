-- Terugdraaien van 20261002100000_badlinnenpakket.sql
-- Zet het pakket op non-actief en haalt het uit de gastenlijst.
-- De rij in wz_extras blijft bestaan: er kunnen al boekingen aan hangen.

begin;

update public.wz_extras
   set actief = false
 where naam = 'Badlinnenpakket extra';

update public.gast_catalogus
   set data = (
     select coalesce(jsonb_agg(x), '[]'::jsonb)
       from jsonb_array_elements(data) as x
      where x->>'id' is distinct from 'srv_badlinnen'
   )
 where id = 'standaard';

commit;
