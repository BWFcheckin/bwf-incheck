-- Feestpakketten, feestopties en twee dranken toevoegen aan wz_extras
--
-- Aanleiding: Angela leverde op 16-09-2026 de folders van de Kids Poolparty
-- (t/m 11 jaar en 12+/gemengd) en de Bridal-/Babyshower aan, plus het
-- intakeformulier. Die pakketten en hun losse opties stonden nog nergens in de
-- database; de reserveringspagina leest alle arrangementen en extra's uit deze
-- tabel, dus hier horen ze thuis en niet in de HTML.
--
-- Door Angela bevestigd op 16-09-2026:
--   * Bridal-/Babyshower kost EUR 1000 (op de folder was het bedrag afgesneden).
--   * De feesten worden alleen in Almere geboekt -> locatie = 'Almere'.
--   * "Luxe sushi schaal + EUR 100" is een meerprijs BOVENOP het pakket,
--     dus een los aan te vinken item, geen vervanging van de sushi schaal (75).
--   * Bier EUR 6 per fles gaat in dezelfde migratie mee.
--
-- Alleen toevoegen, niets wijzigen en niets verwijderen.
-- Er staat GEEN unieke sleutel op wz_extras.naam, dus zonder de not-exists
-- bescherming hieronder zou twee keer draaien dertien dubbele regels opleveren
-- die daarna stilzwijgend in de prijsopsomming meetellen.
--
-- De kolom locatie kent een CHECK: NULL, 'Almere' of 'Lelystad'.
-- De kolom categorie kent geen CHECK, dus de nieuwe groep 'Feest' mag.

begin;

insert into wz_extras (naam, categorie, prijs, per_persoon, omschrijving, actief, sortering, locatie)
select v.naam, v.categorie, v.prijs, v.per_persoon, v.omschrijving, true, v.sortering, v.locatie
from (values
  -- de drie pakketten zelf
  ('Kids Poolparty t/m 11 jaar'::text, 'Arrangement'::text, 850.00::numeric, false::boolean,
   '3 uur exclusief prive wellness inclusief handdoeken, ballonnen, 2 ballonnenpilaren en opblaasspeelgoed, onbeperkt limonade, water, koffie en thee, goodiebags. Maximaal 10 kinderen tot 11 jaar en 2 begeleiders. Inclusief feesttaart met bordjes en bestek en keuze uit patat met hamburger of hotdogs.'::text,
   210::integer, 'Almere'::text),
  ('Kids Poolparty 12+ of gemengd', 'Arrangement', 1000.00, false,
   '3 uur exclusief prive wellness inclusief handdoeken, ballonnen en floating devices, onbeperkt limonade, water, koffie, thee en frisdrank, goodiebags. Maximaal 10 kinderen vanaf 12 jaar en 2 begeleiders. Inclusief feesttaart met bordjes en bestek en keuze uit patat met hamburger, hotdogs of high tea.',
   220, 'Almere'),
  ('Bridal- of Babyshower', 'Arrangement', 1000.00, false,
   '3 uur verblijf inclusief handdoeken, badjassen en slippers, ballonnenversiering en floating devices, kroon en sjerp, goodiebags en spelletjes, fles bubbels, water, koffie, thee en frisdrank. Maximaal 10 personen. Keuze uit high wine met warme snacks, high tea, of burger- en chickenwingsmenu.',
   230, 'Almere'),

  -- losse opties die op alle drie de folders staan onder "Optioneel bij te boeken"
  ('Thema versiering', 'Feest', 150.00, false,
   'Versiering in een gekozen thema, bijvoorbeeld Tropical Poolparty, Spider-Man, Unicorn of Marvel. Een eigen thema kan in overleg.', 10, 'Almere'),
  ('Ballonnenboog', 'Feest', 125.00, false,
   'Ballonnenboog in de kleuren van het feest.', 20, 'Almere'),
  ('Gepersonaliseerde taart', 'Feest', 75.00, false,
   'Taart met eigen naam, foto of thema.', 30, 'Almere'),
  ('Gepersonaliseerde cupcakes', 'Feest', 50.00, false,
   'Cupcakes met eigen naam, foto of thema.', 40, 'Almere'),
  ('Fotomoment met fotoboek', 'Feest', 100.00, false,
   'Fotomoment tijdens het feest; het fotoboek wordt nageleverd.', 50, 'Almere'),
  ('Sweettable', 'Feest', 125.00, false,
   'Tafel gevuld met taart, snoep, chips, popcorn en meer.', 60, 'Almere'),
  ('Extra uur', 'Feest', 100.00, false,
   'Een uur langer dan de drie uur die in het pakket zitten.', 70, 'Almere'),
  ('Luxe sushi schaal (meerprijs)', 'Feest', 100.00, false,
   'Meerprijs bovenop het pakket, te kiezen bij de Bridal- of Babyshower.', 80, 'Almere'),

  -- dranken: gelden overal, dus locatie blijft leeg
  ('Zoete wijn', 'Drank', 30.00, false,
   'Fles zoete wijn.', 81, null),
  ('Bier per fles', 'Drank', 6.00, false,
   'Per fles; vul bij de reservering het aantal flesjes in.', 82, null)
) as v(naam, categorie, prijs, per_persoon, omschrijving, sortering, locatie)
where not exists (
  select 1 from wz_extras b
  where b.naam = v.naam and b.categorie = v.categorie
);

commit;
