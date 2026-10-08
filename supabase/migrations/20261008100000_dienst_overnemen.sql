-- ===========================================================================
--  Een dienst die door twee mensen is gedraaid - Angela, 08-10-2026
-- ===========================================================================
--  "Bij de reserveringskaart staat nu de naam van de locatiemanager, maar als
--   iemand de dienst overneemt moet er een tweede naam gekoppeld kunnen worden.
--   En als er twee namen bij de dienst staan, moet je kunnen aangeven of het
--   volledig was, alleen inchecken, alleen schoonmaak etc."
--
--  Dat gebeurt in het echt regelmatig: de een checkt in, de ander checkt uit en
--  maakt schoon. Nu past dat niet: er is één naam, en wie die naam heeft krijgt
--  de hele dienst op zijn urenstaat.
--
--  DRIE KOLOMMEN
--  1. locatiemanager_deel    - wat de eerste persoon deed
--  2. locatiemanager_2_id    - de tweede persoon (uuid naar wz_medewerkers)
--  3. locatiemanager_2_deel  - wat die deed
--
--  De waarden van "deel" zijn dezelfde drie die in de urenstaat al bestaan:
--    volledig  - incheck + uitcheck + schoonmaak
--    incheck   - alleen inchecken
--    uitcheck  - uitchecken en schoonmaak
--  Leeg betekent volledig. Zo verandert er niets aan de boekingen die er al
--  staan: één naam zonder deel blijft gewoon de hele dienst.
--
--  WAAROM EEN CHECK EROP
--  Een tikfout als "Incheck" of "inchek" zou later nergens herkend worden en
--  stil verkeerde uren opleveren. De database weigert zo'n waarde meteen.
--
--  RECHTEN
--  De trigger bwf_reservering_beperkt() zet bij een locatiemanager alleen de
--  velden terug die daar met naam in staan. Deze drie staan daar niet in, dus
--  een locatiemanager mag ze zelf invullen - dat is de bedoeling: hij staat op
--  locatie en weet wie het overneemt.
--
--  Er wordt niets verwijderd en geen bestaande regel verandert. Twee keer
--  draaien doet de tweede keer niets.
-- ===========================================================================

begin;

alter table public.reserveringen
  add column if not exists locatiemanager_deel text,
  add column if not exists locatiemanager_2_id uuid
    references public.wz_medewerkers(id) on delete set null,
  add column if not exists locatiemanager_2_deel text;

comment on column public.reserveringen.locatiemanager_deel is
  'Wat de locatiemanager bij deze dienst deed: volledig, incheck of uitcheck. '
  'Leeg betekent volledig.';
comment on column public.reserveringen.locatiemanager_2_id is
  'De tweede medewerker als de dienst is overgenomen of gedeeld. Koppeling naar '
  'wz_medewerkers.id.';
comment on column public.reserveringen.locatiemanager_2_deel is
  'Wat die tweede medewerker deed: volledig, incheck of uitcheck.';

-- Alleen de drie bekende waarden toelaten, zodat er geen tikfout in de
-- database belandt die de urenstaat later niet herkent.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'reserveringen_lm_deel_check') then
    alter table public.reserveringen
      add constraint reserveringen_lm_deel_check
      check (locatiemanager_deel is null
             or locatiemanager_deel in ('volledig', 'incheck', 'uitcheck'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'reserveringen_lm2_deel_check') then
    alter table public.reserveringen
      add constraint reserveringen_lm2_deel_check
      check (locatiemanager_2_deel is null
             or locatiemanager_2_deel in ('volledig', 'incheck', 'uitcheck'));
  end if;
end $$;

-- Voor de urenstaat van de tweede persoon: die zoekt op zijn eigen id.
create index if not exists reserveringen_locatiemanager_2_idx
  on public.reserveringen (locatiemanager_2_id, aankomst);

commit;

-- ===========================================================================
--  CONTROLE - draai dit erna
-- ===========================================================================
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'reserveringen'
--    and column_name like 'locatiemanager%'
--  order by column_name;
--
--  verwacht: vijf regels - locatiemanager (text), locatiemanager_2_deel (text),
--  locatiemanager_2_id (uuid), locatiemanager_deel (text) en
--  locatiemanager_id (uuid). Alle vijf nullable.
-- ===========================================================================

-- ===========================================================================
--  TERUGDRAAIEN
-- ===========================================================================
--  Eerst leegmaken, zodat er niets verdwijnt als je later van gedachten
--  verandert:
--
--  update public.reserveringen
--     set locatiemanager_deel = null,
--         locatiemanager_2_id = null,
--         locatiemanager_2_deel = null
--   returning id;
--
--  Pas als je zeker weet dat je ze niet meer wilt:
--  drop index if exists public.reserveringen_locatiemanager_2_idx;
--  alter table public.reserveringen drop constraint if exists reserveringen_lm_deel_check;
--  alter table public.reserveringen drop constraint if exists reserveringen_lm2_deel_check;
--  alter table public.reserveringen drop column locatiemanager_2_deel;
--  alter table public.reserveringen drop column locatiemanager_2_id;
--  alter table public.reserveringen drop column locatiemanager_deel;
-- ===========================================================================
