-- Bier per fles en Rookterras toevoegen aan de extra's
-- ---------------------------------------------------------------------------
-- Angela, 28-09-2026: "kun je deze toevoegen aan de extra's en aan het
-- incheckformulier." Bier EUR 6,00 en rookterras EUR 10,00.
--
-- WAAR ZE GELDEN - gecorrigeerd op 29-09-2026
-- Ik had dit eerst allebei op Lelystad gezet. Angela:
--
--   Bier per fles   overal          EUR 6,00
--   Rookterras      alleen Almere   EUR 10,00
--
--   Malina Jacuzzi  heeft geen rookgelegenheid
--   Malina Deluxe   heeft een eigen rookterras dat bij de suite hoort; daar
--                   valt dus niets bij te boeken
--
-- Daarom twee regels met een eigen locatie, en niet allebei dezelfde.
-- locatie = null betekent: geldt op alle locaties.
--
-- KEUZES DIE IK HEB GEMAAKT, kijk ze even na:
--   * Bier komt in de categorie "Eten en drinken", het rookterras bij
--     "Services" - dat sluit aan bij hoe de andere extra's zijn ingedeeld en
--     bepaalt het pictogram in het scherm.
--   * per_persoon = false. Je vinkt ze aan en vult zelf een aantal in; bij
--     per_persoon zou het scherm vermenigvuldigen met het aantal gasten, en
--     dat klopt niet voor een fles bier of een terras.
--
-- Er wordt niets overschreven: bestaat er al een extra met dezelfde naam op
-- dezelfde locatie, dan slaat hij die over en verandert er niets aan.

begin;

insert into public.wz_extras (naam, categorie, prijs, per_persoon, omschrijving, locatie, actief)
select v.naam, v.categorie, v.prijs, false, v.omschrijving, v.locatie, true
from (values
  ('Bier per fles', 'Eten en drinken',  6.00, 'per fles',                    null),
  ('Rookterras',    'Services',        10.00, 'gebruik van het rookterras', 'Almere')
) as v(naam, categorie, prijs, omschrijving, locatie)
where not exists (
  select 1 from public.wz_extras b
  where lower(b.naam) = lower(v.naam)
    and coalesce(b.locatie, '') = coalesce(v.locatie, '')
);

commit;

-- ===========================================================================
--  CONTROLE - draai dit erna
-- ===========================================================================
--  Er horen twee regels te staan: bier zonder locatie (overal), rookterras
--  op Almere.

select naam, categorie, prijs, per_persoon,
       coalesce(locatie, 'alle locaties') as geldt_voor, actief
from public.wz_extras
where naam in ('Bier per fles', 'Rookterras')
order by naam;

-- ===========================================================================
--  TERUGDRAAIEN
-- ===========================================================================
--  Op non-actief zetten in plaats van verwijderen: staan ze al op een boeking,
--  dan blijft die regel zo gewoon kloppen.
--
--  update public.wz_extras set actief = false
--  where naam in ('Bier per fles', 'Rookterras');
