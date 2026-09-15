-- VOORSTEL: prijzen en teksten in wz_extras gelijktrekken met de tarievenpagina
-- Geschreven 16-09-2026. NOG NIET UITGEVOERD: eerst lezen, dan pas draaien.
--
-- wz_extras is de lijst waaruit medewerkers kiezen op de reserveringspagina en
-- in het VR-dashboard. Die lijst wijkt op een aantal punten af van wat er op
-- bedenwellnessflevoland.nl/tarieven staat. Hieronder staat per regel wat er
-- verandert, met de oude en de nieuwe waarde erbij.
--
-- WIJZIGEN GAAT OP NAAM. Dat mag, omdat elke naam hieronder precies een keer
-- voorkomt. De enige uitzondering is "Romantisch arrangement": die staat er twee
-- keer in, en daar wordt de prijs als extra voorwaarde gebruikt om de juiste
-- regel te raken (75,00 is de echte, 0,00 is de dubbele).
--
-- ER WORDT NIETS VERWIJDERD. De dubbele regel wordt op actief = false gezet,
-- zodat hij uit de keuzelijst verdwijnt maar in de database blijft staan.
--
-- WAT ER BEWUST NIET IN ZIT, omdat de prijs niet vaststaat:
--   bier per fles, zoete wijn, de blinddoek, Kids Pool Party en
--   Bridal / Babyshower. Zodra Angela die doorgeeft volgt een aparte migratie.
--
-- WAT DEZE MIGRATIE NIET KAN: per suite filteren. wz_extras heeft geen
-- suitekolom. Almeerse en Lelystadse arrangementen staan dus door elkaar in de
-- lijst. Dat is een aparte keuze en zit hier niet in.
--
-- Terugdraaien:
--   supabase/rollback/20260916090000_extras_prijzen_bijwerken_terugdraaien.sql
--
-- Uitvoeren met:
--   supabase db query --linked -f supabase/migrations/20260916090000_extras_prijzen_bijwerken.sql

begin;

-- ---------- 1. prijzen die afwijken van de tarievenpagina ----------

-- Rozen hart: 15,00 -> 25,00  (website: Rozenhart EUR 25)
update public.wz_extras set prijs = 25.00,
       omschrijving = 'Romantisch cadeau, mooi verpakt.'
 where naam = 'Rozen hart';

-- Ontbijt bij overnachting: 19,50 per persoon -> 39,00 voor het geheel
-- (website: Ontbijt / lunch EUR 39, niet per persoon)
update public.wz_extras set prijs = 39.00, per_persoon = false,
       omschrijving = 'Belegde broodjes, gekookt eitje, croissants met jam en boter, yoghurt, vers fruit en jus d''orange. Halal beschikbaar.'
 where naam = 'Ontbijt bij overnachting';

-- Chicken wings menu: 17,50 per persoon -> 35,00 voor het geheel
-- (website: Chicken Wings Menu EUR 35)
update public.wz_extras set prijs = 35.00, per_persoon = false,
       omschrijving = 'Knapperige kippenvleugels met frietjes en saus.'
 where naam = 'Chicken wings menu';

-- ---------- 2. de dubbele regel uitzetten ----------
-- Romantisch arrangement staat er twee keer in; de tweede staat op 0,00.
-- Niet verwijderen, alleen uit de keuzelijst halen.

update public.wz_extras set actief = false
 where naam = 'Romantisch arrangement' and prijs = 0.00;

-- ---------- 3. notities vervangen door echte klantteksten ----------
-- Er stond "prijs nog invullen" in het omschrijvingsveld. Dat is een notitie,
-- geen tekst voor de gast.

update public.wz_extras set omschrijving = 'Wellness romantisch versierd met ballonnen, rozen, rozenblaadjes en Ferrero Rocher bonbons.'
 where naam = 'Romantisch arrangement' and prijs = 75.00;
update public.wz_extras set omschrijving = 'Wellness versierd met ballonnen en een taart met fruit.'
 where naam = 'Verjaardag arrangement';
update public.wz_extras set omschrijving = 'Romantisch cadeau, mooi verpakt.'
 where naam in ('Zeeprozen boeket', 'Rozen beer');
update public.wz_extras set omschrijving = 'Wisselende luxe snacks, van chicken wings tot chili cheese bites. Halal beschikbaar.'
 where naam = 'Borrelplank';
update public.wz_extras set omschrijving = 'Belegde broodjes, gekookt eitje, croissants, yoghurt, vers fruit en jus d''orange. Halal beschikbaar.'
 where naam = 'Lunch';
update public.wz_extras set omschrijving = 'Keuze uit prosecco, chardonnay of champagne. Zie de losse regels hieronder voor de soorten.'
 where naam = 'Fles wijn of bubbels';

-- ---------- 4. ontbrekende items toevoegen ----------
-- Alleen items die met prijs en al op de tarievenpagina staan.

insert into public.wz_extras (naam, categorie, prijs, per_persoon, omschrijving, actief, sortering) values
  ('Verjaardag Deluxe',    'Arrangement', 125.00, false, 'Extra romantische versiering, twee glazen prosecco, borrelplank en chocolade bonbons.', true, 31),
  ('VIP arrangement',      'Arrangement', 250.00, false, 'Wellness versierd met ballonnen en een fles Champagne Moet & Chandon Ice. Keuze uit sushi schaal of burger menu.', true, 32),
  ('356 Days of Valentine','Arrangement', 300.00, false, 'Over-the-top romantische versiering met heliumballonnen, rozen, rozenbeer, bonbons en een flesje bubbels.', true, 33),
  ('Bruidsnacht Angie',    'Arrangement', 849.00, false, 'Romantisch versierde suite, ontbijt op de suite en een flesje champagne. Check-in 01:00, check-out 15:00.', true, 34),
  ('Bruidsnacht Jacuzzi',  'Arrangement', 699.00, false, 'Romantisch versierde suite, ontbijt op de suite en een flesje champagne. Check-in 01:00, check-out 15:00.', true, 35),
  ('Bruidsnacht Zwembad',  'Arrangement', 999.00, false, 'Romantisch versierde suite, ontbijt op de suite en een flesje champagne. Check-in 01:00, check-out 15:00.', true, 36),

  ('Charcuterie board',    'Menu',  49.00, false, 'Selectie koude hapjes met hartige worst, zachte kazen en frisse dips.', true, 61),
  ('Chicken platter',      'Menu',  39.00, false, 'Kipvariatie met verschillende dips en goudgele friet.', true, 62),
  ('Burger menu',          'Menu',  39.00, false, 'Black Angus beef of crispy chicken met sla, tomaat, komkommer en saus. Met frietmandje.', true, 63),
  ('Tasting Tree',         'Menu',  69.00, false, 'Hapjesboom met hartige mini-gerechten en frisse smaakmakers.', true, 64),
  ('Champagne ontbijt',    'Menu',  79.00, false, 'Fijne broodjes, croissants, yoghurt, vers fruit en een elegante champagne.', true, 65),
  ('High Tea',             'Menu',  24.50, true,  'Zoete lekkernijen en hartige bites. Vanaf vier personen.', true, 66),

  ('Prosecco',             'Drank',  30.00, false, 'Fles prosecco.', true, 76),
  ('Chardonnay',           'Drank',  30.00, false, 'Fles chardonnay.', true, 77),
  ('Champagne',            'Drank',  50.00, false, 'Fles champagne.', true, 78),
  ('Moet & Chandon Ice',   'Drank', 125.00, false, 'Fles Moet & Chandon Ice Edition.', true, 79),
  ('Mocktail karaf',       'Drank',  30.00, false, 'Alcoholvrije karaf met verse mocktail.', true, 80),

  ('Waterpijp',            'Service', 30.00, false, 'Diverse smaken, waaronder Love 66, Mi Amore en dubbel appel.', true, 101),
  ('Massagetafel',         'Service', 25.00, false, 'Professionele massagetafel, inclusief handdoek en olie. Alleen in Lelystad.', true, 102);

commit;
