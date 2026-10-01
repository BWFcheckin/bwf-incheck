-- Badlinnenpakket: extra set handdoeken, EUR 20
-- ---------------------------------------------------------------------------
-- Angela, 02-10-2026: "voeg toe extra bij te boeken badlinnen pakket extra set
-- handdoeken 20 euro."
--
-- Het moet op TWEE plekken staan, anders ziet maar de helft van het systeem
-- het:
--
--   wz_extras       de kaart die het reserveringenscherm, het locatiedashboard
--                   en de rekenhulp van Kelly gebruiken
--   gast_catalogus  wat de gast zelf te zien krijgt op het gastformulier
--                   (gast-incheck.html). Die tabel is een enkele rij met een
--                   jsonb-lijst; staat hij gevuld, dan overschrijft hij de
--                   lijst die in de pagina zelf is ingebouwd.
--
-- Beide delen zijn herhaalbaar: twee keer draaien verandert niets extra.
-- Er wordt niets verwijderd.

begin;

-- ---------------------------------------------------------------------------
-- 1. De kaart voor personeel
-- ---------------------------------------------------------------------------
insert into public.wz_extras (naam, categorie, prijs, per_persoon, omschrijving, actief, sortering, locatie)
select 'Badlinnenpakket extra', 'Service', 20.00, false,
       'Een extra set handdoeken en badlinnen', true, 100, null
 where not exists (
   select 1 from public.wz_extras where naam = 'Badlinnenpakket extra'
 );

-- ---------------------------------------------------------------------------
-- 2. De lijst die de gast ziet
-- ---------------------------------------------------------------------------
-- Dezelfde vorm als de andere items in die lijst (zie gast-incheck-beheer.html):
-- id, groep, naam, prijs, suites, maxAantal, oms. Bewust zonder `img`: een
-- verwijzing naar een afbeelding die er niet is geeft een kapot plaatje.
update public.gast_catalogus
   set data = data || jsonb_build_array(jsonb_build_object(
         'id',        'srv_badlinnen',
         'groep',     'srv',
         'naam',      'Badlinnenpakket extra',
         'prijs',     20,
         'suites',    jsonb_build_array('angie','jacuzzi','deluxe'),
         'maxAantal', 4,
         'oms',       'Een extra set handdoeken en badlinnen.'
       ))
 where id = 'standaard'
   and not (data @> '[{"id":"srv_badlinnen"}]'::jsonb);

commit;

-- Controle 1 — hoort 1 regel te geven:
--   select naam, categorie, prijs, actief, locatie
--     from public.wz_extras where naam = 'Badlinnenpakket extra';
--
-- Controle 2 — hoort 1 regel te geven met de naam erin:
--   select jsonb_path_query_first(data, '$[*] ? (@.id == "srv_badlinnen")')
--     from public.gast_catalogus where id = 'standaard';
--
-- Komt controle 2 leeg terug terwijl de rij wel bestaat, dan stond het item er
-- al in. Bestaat de rij 'standaard' helemaal niet, dan gebruikt het
-- gastformulier de lijst die in de pagina is ingebouwd en hoeft deel 2 niet.
--
-- Terugdraaien: zie rollback/20261002100000_terug.sql
