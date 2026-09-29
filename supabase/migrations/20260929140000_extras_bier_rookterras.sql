-- Bier per fles en Rookterras toevoegen aan de extra's
-- ---------------------------------------------------------------------------
-- Angela, 28-09-2026: "kun je deze toevoegen aan de extra's en aan het
-- incheckformulier." Bier EUR 6,00 en rookterras EUR 10,00.
--
-- Het incheckformulier is al aangepast: daar staat de menukaart in de pagina
-- zelf. Deze twee regels zijn voor wz_extras, de lijst waaruit je kiest bij
-- "Extra's bijboeken" op een reservering.
--
-- Gebruik: Supabase -> SQL Editor -> New query -> plakken -> Run.
--
-- KEUZES DIE IK HEB GEMAAKT, kijk ze even na:
--   * Bier komt in de categorie "Eten en drinken", het rookterras bij
--     "Services" - dat sluit aan bij hoe de andere extra's zijn ingedeeld en
--     bepaalt het pictogram in het scherm.
--   * locatie = 'Lelystad'. Zo verschijnen ze alleen bij Malina Jacuzzi en
--     Malina Deluxe, niet bij Suite Angie in Almere. Wil je ze daar ook, zet
--     locatie dan op null; dan gelden ze overal.
--   * per_persoon = false. Je vinkt ze aan en vult zelf een aantal in; bij
--     per_persoon zou het scherm vermenigvuldigen met het aantal gasten, en
--     dat klopt niet voor een fles bier of een terras.
--
-- Er wordt niets overschreven: bestaat er al een extra met dezelfde naam op
-- dezelfde locatie, dan slaat hij die over en verandert er niets aan.

begin;

insert into public.wz_extras (naam, categorie, prijs, per_persoon, omschrijving, locatie, actief)
select v.naam, v.categorie, v.prijs, false, v.omschrijving, 'Lelystad', true
from (values
  ('Bier per fles', 'Eten en drinken', 6.00,  'per fles'),
  ('Rookterras',    'Services',        10.00, 'gebruik van het rookterras')
) as v(naam, categorie, prijs, omschrijving)
where not exists (
  select 1 from public.wz_extras b
  where lower(b.naam) = lower(v.naam)
    and coalesce(b.locatie, '') = 'Lelystad'
);

commit;

-- ===========================================================================
--  CONTROLE - draai dit erna
-- ===========================================================================
--  Er horen twee regels te staan, met de juiste prijs en categorie.

select naam, categorie, prijs, per_persoon, locatie, actief
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
--  where naam in ('Bier per fles', 'Rookterras') and locatie = 'Lelystad';
