-- TERUGDRAAIEN van 20260916090000_extras_prijzen_bijwerken.sql
--
-- Zet wz_extras terug in de staat van vóór 16-09-2026:
--   - de drie gewijzigde prijzen gaan terug naar hun oude waarde
--   - de dubbele regel Romantisch arrangement staat weer op actief
--   - de twintig toegevoegde items worden op actief = false gezet
--
-- ER WORDT NIETS VERWIJDERD, ook niet bij het terugdraaien. De toegevoegde
-- items blijven in de database staan maar verdwijnen uit de keuzelijst. Wil je
-- ze echt weg, doe dat dan met de hand en pas nadat je zeker weet dat geen
-- enkele reservering ernaar verwijst.
--
-- LET OP: de omschrijvingen die de migratie heeft overschreven, gaan hiermee
-- NIET terug naar hun oude tekst. De oude teksten waren notities zoals "prijs
-- nog invullen"; die zijn niet bewaard. Wil je ze terug, haal ze dan uit de
-- git-geschiedenis van de inventaris of uit een export.
--
-- Uitvoeren met:
--   supabase db query --linked -f supabase/rollback/20260916090000_extras_prijzen_bijwerken_terugdraaien.sql

begin;

-- 1. prijzen terug
update public.wz_extras set prijs = 15.00 where naam = 'Rozen hart';
update public.wz_extras set prijs = 19.50, per_persoon = true where naam = 'Ontbijt bij overnachting';
update public.wz_extras set prijs = 17.50, per_persoon = true where naam = 'Chicken wings menu';

-- 2. de dubbele regel weer aan
update public.wz_extras set actief = true
 where naam = 'Romantisch arrangement' and prijs = 0.00;

-- 3. de toegevoegde items uit de keuzelijst halen
update public.wz_extras set actief = false
 where naam in ('Verjaardag Deluxe','VIP arrangement','356 Days of Valentine',
                'Bruidsnacht Angie','Bruidsnacht Jacuzzi','Bruidsnacht Zwembad',
                'Charcuterie board','Chicken platter','Burger menu','Tasting Tree',
                'Champagne ontbijt','High Tea',
                'Prosecco','Chardonnay','Champagne','Moet & Chandon Ice','Mocktail karaf',
                'Waterpijp','Massagetafel');

commit;
