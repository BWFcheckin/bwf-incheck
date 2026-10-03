-- Terugdraaien van 20261003100000_badlinnen_late_incheck_gastlink.sql

begin;

-- 1 en 2: op non-actief, niet weg - er kunnen al boekingen aan hangen.
update public.wz_extras
   set actief = false
 where naam in ('Badlinnenpakket extra', 'Late incheck na 22:00');

-- 3: uit de lijst die de gast ziet.
update public.gast_catalogus
   set data = (
     select coalesce(jsonb_agg(x), '[]'::jsonb)
       from jsonb_array_elements(data) as x
      where x->>'id' not in ('srv_badlinnen', 'srv_laat')
   )
 where id = 'standaard';

-- 4: de gastlink. De FUNCTIES gaan weg, de TABEL blijft staan: daar hangen
--    links in die al naar gasten zijn verstuurd, en die wil je kunnen
--    terugzoeken. Zonder de functies werkt het voorvullen niet meer en valt
--    reserveringen.html vanzelf terug op de kale link.
drop function if exists public.bwf_gastlink_open(text);
drop function if exists public.bwf_gastlink_maak(uuid);

commit;
