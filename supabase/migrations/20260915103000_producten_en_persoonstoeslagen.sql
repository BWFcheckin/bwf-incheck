-- Omschrijvingen, suite per product en personentoeslagen (keuze Angela, 15-09-2026)
--
-- Voor de nieuwe reserveringspagina moeten drie dingen uit de database komen in
-- plaats van uit de pagina zelf, zodat een tariefwijziging op een plek gebeurt:
--
--   1. een omschrijving per product ("wat zit erin, wat krijgt de klant")
--   2. per welke suite een product geldt (Almere kent andere arrangementen
--      dan Lelystad); leeg betekent: geldt voor alle suites
--   3. de toeslagen voor extra volwassenen en kinderen, die per suite en per
--      dagverblijf/overnachting verschillen
--
-- VOORAF GECONTROLEERD op de gekoppelde omgeving:
--   - bwf_producten heeft nog geen kolom omschrijving of suite
--   - er bestaat nog geen tabel die met bwf_persoon begint
--   - bwf_producten en bwf_tariefblokken hebben alleen een leesregel; deze
--     migratie verandert die rechten NIET. Het vullen hieronder gebeurt met
--     beheerdersrechten en gaat dus buiten die leesregels om.
--
-- WAT ER NIET GEBEURT:
--   Geen bestaande kolom, rij, recht of trigger verandert. Bestaande producten
--   krijgen omschrijving en suite null en blijven precies werken zoals nu.
--   Pagina's die de nieuwe kolommen niet kennen, merken er niets van.
--
-- WAT ER BEWUST ONTBREEKT:
--   Bier per fles, zoete wijn, de blinddoek, Kids Pool Party en Bridal /
--   Babyshower staan niet in deze migratie. Die prijzen zijn niet vastgesteld;
--   Angela geeft ze door en dan volgt een aparte, kleine migratie. Er worden
--   hier geen bedragen geraden.
--
-- BRON van de bedragen: de tarievenpagina van bedenwellnessflevoland.nl,
-- opgehaald op 15-09-2026. Kinderen van 0 tot 2 jaar zijn gratis en krijgen
-- daarom geen rij.
--
-- Terugdraaien:
--   supabase/rollback/20260915103000_producten_en_persoonstoeslagen_terugdraaien.sql
--
-- Uitvoeren met:
--   supabase db query --linked -f supabase/migrations/20260915103000_producten_en_persoonstoeslagen.sql

begin;

-- ---------- 1. twee kolommen bij de producten ----------

alter table public.bwf_producten
  add column if not exists omschrijving text;

alter table public.bwf_producten
  add column if not exists suite text
  check (suite is null or suite in ('angie', 'malina_jacuzzi', 'malina_deluxe'));

comment on column public.bwf_producten.omschrijving is
  'Wat de klant krijgt. Wordt getoond bij de keuze op de reserveringspagina.';
comment on column public.bwf_producten.suite is
  'Leeg = geldt voor alle suites. Anders alleen voor die ene suite.';

-- ---------- 2. omschrijvingen vullen ----------
-- Alleen waar de tarievenpagina eenduidig is. Wat daar niet op staat, blijft leeg.

update public.bwf_producten set omschrijving = 'Wellness romantisch versierd met ballonnen, rozen, rozenblaadjes en Ferrero Rocher bonbons.'
 where categorie = 'arrangement' and naam = 'Romantisch arrangement';
update public.bwf_producten set omschrijving = 'Wellness versierd met ballonnen en een taart met fruit.'
 where categorie = 'arrangement' and naam = 'Verjaardag arrangement';
update public.bwf_producten set omschrijving = 'Extra romantische versiering, twee glazen prosecco, borrelplank en chocolade bonbons.'
 where categorie = 'arrangement' and naam = 'Verjaardag Deluxe';
update public.bwf_producten set omschrijving = 'Wellness versierd met ballonnen en een fles Champagne Moet & Chandon Ice. Keuze uit sushi schaal of burger menu.'
 where categorie = 'arrangement' and naam = 'VIP arrangement';
update public.bwf_producten set omschrijving = 'Over-the-top romantische versiering met heliumballonnen, rozen, rozenbeer, bonbons en een flesje bubbels.'
 where categorie = 'arrangement' and naam = '356 Days of Valentine';
update public.bwf_producten set omschrijving = 'Romantisch versierde suite, ontbijt op de suite en een flesje champagne of bubbels. Check-in 01:00, check-out 15:00. Maatwerk op aanvraag.'
 where categorie = 'arrangement' and naam like 'Bruidsnacht%';

update public.bwf_producten set omschrijving = 'Belegde broodjes, gekookt eitje, croissants met jam en boter, yoghurt, vers fruit en jus d''orange. Halal beschikbaar.'
 where categorie = 'eten_drinken' and naam = 'Ontbijt / lunch';
update public.bwf_producten set omschrijving = 'Wisselende luxe snacks, van chicken wings tot chili cheese bites. Halal beschikbaar.'
 where categorie = 'eten_drinken' and naam = 'Borrelplank';
update public.bwf_producten set omschrijving = 'Selectie koude hapjes met hartige worst, zachte kazen en frisse dips.'
 where categorie = 'eten_drinken' and naam = 'Charcuterie board';
update public.bwf_producten set omschrijving = 'Kipvariatie met verschillende dips en goudgele friet.'
 where categorie = 'eten_drinken' and naam = 'Chicken platter / wings';
update public.bwf_producten set omschrijving = 'Black Angus beef of crispy chicken met sla, tomaat, komkommer en saus. Met een frietmandje, mayonaise en ketchup.'
 where categorie = 'eten_drinken' and naam = 'Burger menu';
update public.bwf_producten set omschrijving = 'Verfijnde sushi-beleving met een zorgvuldig gekozen assortiment, vers bereid.'
 where categorie = 'eten_drinken' and naam = 'Sushi experience';
update public.bwf_producten set omschrijving = 'Zoete lekkernijen en hartige bites. Vanaf vier personen.'
 where categorie = 'eten_drinken' and naam = 'High Tea per persoon';
update public.bwf_producten set omschrijving = 'Hapjesboom met hartige mini-gerechten en frisse smaakmakers.'
 where categorie = 'eten_drinken' and naam = 'Tasting Tree';
update public.bwf_producten set omschrijving = 'Fijne broodjes, croissants, yoghurt, vers fruit en een elegante champagne.'
 where categorie = 'eten_drinken' and naam = 'Champagne ontbijt';
update public.bwf_producten set omschrijving = 'Alcoholvrije karaf met verse mocktail.'
 where categorie = 'eten_drinken' and naam = 'Mocktail karaf';

update public.bwf_producten set omschrijving = 'Diverse smaken, waaronder Love 66, Mi Amore en dubbel appel.'
 where categorie = 'extra' and naam = 'Waterpijp / shisha';
update public.bwf_producten set omschrijving = 'Professionele massagetafel, inclusief handdoek en olie.'
 where categorie = 'extra' and naam = 'Massagetafel';
update public.bwf_producten set omschrijving = 'Romantisch cadeau, mooi verpakt.'
 where categorie = 'extra' and naam in ('Rozenbeer', 'Rozenhart', 'Zeeprozenboeketje');

-- ---------- 3. suite invullen waar het product locatiegebonden is ----------
-- Alles wat op beide locaties bestaat, blijft leeg (= alle suites).

update public.bwf_producten set suite = 'angie'          where naam = 'Bruidsnacht Angie';
update public.bwf_producten set suite = 'malina_jacuzzi' where naam = 'Bruidsnacht Jacuzzi';
update public.bwf_producten set suite = 'malina_deluxe'  where naam = 'Bruidsnacht Zwembad';

-- ---------- 4. personentoeslagen ----------

create table if not exists public.bwf_persoonstoeslagen (
  id         uuid primary key default gen_random_uuid(),
  suite      text not null check (suite in ('angie', 'malina_jacuzzi', 'malina_deluxe')),
  verblijf   text not null check (verblijf in ('dag', 'nacht')),
  soort      text not null check (soort in ('volwassene', 'kind_2_12')),
  prijs      numeric not null,
  actief     boolean not null default true,
  sortering  integer not null default 100,
  aangemaakt timestamptz not null default now(),
  unique (suite, verblijf, soort)
);

comment on table public.bwf_persoonstoeslagen is
  'Toeslag per extra persoon, per suite en per dagverblijf of overnachting. Kinderen tot 2 jaar zijn gratis en staan hier niet in.';

insert into public.bwf_persoonstoeslagen (suite, verblijf, soort, prijs, sortering) values
  ('angie',          'dag',   'volwassene',  60, 10),
  ('angie',          'dag',   'kind_2_12',   25, 20),
  ('angie',          'nacht', 'volwassene', 100, 10),
  ('angie',          'nacht', 'kind_2_12',   50, 20),
  ('malina_jacuzzi', 'dag',   'volwassene',  60, 10),
  ('malina_jacuzzi', 'dag',   'kind_2_12',   25, 20),
  ('malina_jacuzzi', 'nacht', 'volwassene', 100, 10),
  ('malina_jacuzzi', 'nacht', 'kind_2_12',   50, 20),
  ('malina_deluxe',  'dag',   'volwassene',  75, 10),
  ('malina_deluxe',  'dag',   'kind_2_12',   50, 20),
  ('malina_deluxe',  'nacht', 'volwassene', 125, 10),
  ('malina_deluxe',  'nacht', 'kind_2_12',   75, 20)
on conflict (suite, verblijf, soort) do nothing;

-- ---------- 5. rechten op de nieuwe tabel ----------
-- Zelfde opzet als tijdsblokken: iedereen met een toegangsrol leest,
-- alleen de eigenaar beheert. Dit raakt geen bestaande tabel.

alter table public.bwf_persoonstoeslagen enable row level security;

create policy "persoonstoeslagen lezen" on public.bwf_persoonstoeslagen
  for select to authenticated using ((select public.bwf_toegangsrol()) is not null);

create policy "persoonstoeslagen beheren" on public.bwf_persoonstoeslagen
  for all to authenticated
  using ((select public.bwf_toegangsrol()) = 'eigenaar')
  with check ((select public.bwf_toegangsrol()) = 'eigenaar');

commit;
