-- ===========================================================================
--  De import mag geen betaalde boeking meer stil annuleren
--  Angela, 05-10-2026
-- ===========================================================================
--  Wat er gebeurde. Om 00:45 UTC (02:45 bij ons) verkocht SMG dezelfde nacht in
--  Malina Deluxe die Booking.com al had verkocht. De synclog laat het precies
--  zien: smg ging van 57 naar 58 events en van 51 naar 52 reserveringen, en in
--  diezelfde ronde ging booking van 2 naar 1 reservering met geannuleerd = 1 -
--  terwijl die feed gewoon 7 events hield. Er is dus niets uit de feed
--  verdwenen; onze eigen import herkende de boeking niet meer.
--
--  De oorzaak zit in kanalen-sync: een Booking.com-event op een nacht die al
--  via SMG of OO bezet is, wordt daar als sluiting gelezen en niet als gast
--  (bezetDoorAnder). Daardoor werd de boeking die ronde niet "gezien", en de
--  opruimstap van kanalen_verwerk annuleerde haar - met gast, met 612 euro
--  betaald, en met aankomst diezelfde avond.
--
--  Dat is precies verkeerd om: twee kanalen die dezelfde nacht verkopen is een
--  OVERBOEKING die je moet zien, niet iets dat je stil oplost door een kant weg
--  te gooien.
--
--  WAAROM EEN SLOT OP DE TABEL EN NIET EEN NIEUWE IMPORTFUNCTIE
--  Het zou ook kunnen door kanalen_verwerk te herschrijven, maar dat is een
--  functie van ruim 150 regels en die liep vanmiddag al een keer stuk op een
--  afgekapt plaksel. Belangrijker: een slot op de tabel beschermt tegen ELKE
--  weg die een boeking stil annuleert, niet alleen tegen deze ene functie.
--
--  Het slot grijpt alleen in als geannuleerd_door_import wordt gezet - dat doet
--  uitsluitend de import. Een mens die in het scherm annuleert zet dat vlaggetje
--  niet en merkt hier dus niets van.
--
--  Er wordt niets verwijderd. Bestaande annuleringen blijven zoals ze zijn.
-- ===========================================================================

begin;

-- Wanneer de import deze boeking voor het eerst miste. Leeg = gewoon in de feed.
alter table public.reserveringen
  add column if not exists import_weg_sinds timestamptz;

comment on column public.reserveringen.import_weg_sinds is
  'Gezet zodra de import deze boeking niet meer in de feed vindt maar hem te waardevol vindt om te annuleren (gast of bedrag). Dit is bijna altijd een overboeking tussen twee kanalen: met de hand nalopen.';

create index if not exists reserveringen_import_weg_idx
  on public.reserveringen (import_weg_sinds) where import_weg_sinds is not null;

create or replace function public.bwf_import_mag_niet_annuleren()
returns trigger
language plpgsql
as $$
begin
  -- Alleen bij een annulering DOOR DE IMPORT. Een mens zet dit vlaggetje niet.
  if new.status = 'geannuleerd'
     and old.status is distinct from 'geannuleerd'
     and new.geannuleerd_door_import is true
     -- Is er een gast of geld aan verbonden? Dan is dit te waardevol om stil
     -- weg te zetten.
     and (btrim(coalesce(old.gast_voornaam, '')) <> ''
       or btrim(coalesce(old.gast_achternaam, '')) <> ''
       or coalesce(old.betaald_bedrag, 0) <> 0
       or coalesce(old.bedrag_totaal, 0) <> 0)
  then
    -- De annulering wordt teruggedraaid en in plaats daarvan gemerkt.
    new.status                  := old.status;
    new.geannuleerd_door_import := old.geannuleerd_door_import;
    new.import_weg_sinds        := coalesce(old.import_weg_sinds, now());
  end if;

  -- Staat hij weer gewoon in de feed, dan mag het merkteken weg.
  if new.feed_gezien_op is distinct from old.feed_gezien_op
     and new.feed_gezien_op is not null
     and new.status <> 'geannuleerd'
  then
    new.import_weg_sinds := null;
  end if;

  return new;
end
$$;

-- Naam begint met bwf_b zodat hij vóór bwf_reservering_handmatig draait; die
-- kijkt naar de ingelogde gebruiker en raakt dit niet.
drop trigger if exists bwf_beschermd_tegen_import on public.reserveringen;
create trigger bwf_beschermd_tegen_import
  before update on public.reserveringen
  for each row execute function public.bwf_import_mag_niet_annuleren();

commit;

-- ===========================================================================
--  CONTROLE - draai dit erna
-- ===========================================================================
--  1. Het slot staat er (verwacht: 1).
--
-- select count(*) as slot from pg_trigger
--  where tgrelid = 'public.reserveringen'::regclass
--    and tgname = 'bwf_beschermd_tegen_import';
--
--  2. Na de eerstvolgende importronde (hooguit een kwartier): welke boekingen
--     mist de import, maar zijn beschermd? Dit zijn de gevallen om met de hand
--     na te lopen - meestal een overboeking tussen twee kanalen.
--
-- select kanaal, kanaal_ref, suite, aankomst, gast_voornaam, gast_achternaam,
--        bedrag_totaal, betaald_bedrag, import_weg_sinds
--   from public.reserveringen
--  where import_weg_sinds is not null
--  order by aankomst;
-- ===========================================================================
