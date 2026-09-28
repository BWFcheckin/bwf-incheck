-- Reviewstand per reservering
-- ---------------------------------------------------------------------------
-- Angela, 28-09-2026: "in de reserveringskaart een optie waarbij je kunt
-- aangeven: reviewlink al verstuurd, qr-code gescand, en geen review sturen
-- omdat de klant niet tevreden is."
--
-- WAAROM ER EEN KOLOM BIJ MOET
-- Er is al `review_verstuurd`, maar dat is een datumkolom: die kan alleen
-- "wel" of "niet" zeggen. Drie standen passen er niet in, en "geen review
-- sturen" al helemaal niet - dat zou je met een lege datum niet kunnen
-- onderscheiden van "nog niet gedaan".
--
-- WAT ER GEBEURT
--   * er komt EEN kolom bij: reserveringen.review_status
--   * bestaande boekingen met een datum in review_verstuurd krijgen meteen de
--     stand 'verstuurd', zodat de controlebalk blijft kloppen
--   * review_verstuurd zelf blijft ongemoeid en wordt gewoon meegeschreven;
--     er verdwijnt geen enkele datum
--
-- Toegestane waarden:
--   null        nog niets gedaan
--   'verstuurd' de reviewlink is naar de gast gestuurd
--   'gescand'   de gast heeft het bordje in de suite gescand
--   'geen'      bewust geen review vragen, de gast was niet tevreden
--
-- WIE MAG DIT WIJZIGEN
-- De trigger bwf_reservering_beperkt() zet bij een locatiemanager alleen de
-- velden terug die daar met naam genoemd staan. Deze nieuwe kolom staat daar
-- niet in, dus Gildo mag de stand zelf aanvinken. Dat is met opzet: hij staat
-- op locatie en ziet als eerste dat er gescand is. Wil je dat juist niet, zeg
-- het dan, dan zet ik de kolomnaam alsnog in die functie erbij.
--
-- Er wordt niets verwijderd en niets overschreven.

begin;

alter table public.reserveringen
  add column if not exists review_status text;

-- Alleen de vier bekende waarden toelaten, zodat er geen typefout in de
-- database belandt die het scherm later niet herkent.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reserveringen_review_status_check'
  ) then
    alter table public.reserveringen
      add constraint reserveringen_review_status_check
      check (review_status is null or review_status in ('verstuurd', 'gescand', 'geen'));
  end if;
end $$;

comment on column public.reserveringen.review_status is
  'Reviewstand: null = nog niets, verstuurd = link naar de gast gestuurd, '
  'gescand = gast scande het bordje in de suite, geen = bewust niet vragen.';

-- Wat er al verstuurd was, overnemen. Alleen waar nog niets stond.
update public.reserveringen
   set review_status = 'verstuurd'
 where review_verstuurd is not null
   and review_status is null;

commit;

-- ===========================================================================
--  CONTROLE - draai dit erna
-- ===========================================================================
--  Hier hoort een regel 'verstuurd' te staan met hetzelfde aantal als je aan
--  ingevulde review_verstuurd-datums had, en verder alles op null.

select coalesce(review_status, '(nog niets)') as stand, count(*)
from public.reserveringen
group by 1
order by 2 desc;

-- ===========================================================================
--  TERUGDRAAIEN
-- ===========================================================================
--  De kolom leegmaken in plaats van hem te laten vallen, zodat er geen
--  gegevens verdwijnen als je later van gedachten verandert:
--
--  update public.reserveringen set review_status = null;
--
--  Pas als je zeker weet dat je hem niet meer wilt:
--  alter table public.reserveringen drop constraint reserveringen_review_status_check;
--  alter table public.reserveringen drop column review_status;
