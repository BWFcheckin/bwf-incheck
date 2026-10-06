-- ===========================================================================
--  Locatiemanager koppelen aan een reservering - Angela, 06-10-2026
-- ===========================================================================
--  "Maak bij elke reserveringskaart een veld waarbij de locatiemanagernaam
--   gekoppeld kan worden aan de reservering. Die naam moet ook tevoorschijn
--   komen bij de reserveringsoverzichten, zodat ik ook kan zien hoeveel
--   diensten iemand in de maand heeft gedraaid."
--
--  WAAROM NIET DE BESTAANDE KOLOM `medewerker`
--  reserveringen.medewerker bestaat al, maar daar zet de welkomstcall de
--  medewerker in die heeft GEBELD - en dat is Kelly (vr), niet de
--  locatiemanager die de dienst draaide. Zou ik die kolom hergebruiken, dan
--  tellen Kelly's telefoontjes mee als diensten en is het maandoverzicht
--  onbruikbaar. De kolom blijft dus staan en onaangeroerd.
--
--  TWEE KOLOMMEN, MET OPZET
--  1. locatiemanager_id - de echte koppeling naar wz_medewerkers. Exact, ook
--     als er twee mensen "Ruth" heten.
--  2. locatiemanager    - dezelfde naam als leesbare tekst, weggeschreven op
--     hetzelfde moment. Daarmee kan elk overzicht de naam tonen zonder eerst
--     de medewerkerstabel op te halen, en blijft een maandoverzicht van vorig
--     jaar leesbaar ook als iemand uit dienst gaat.
--  De id is de baas: het scherm vult altijd beide uit dezelfde keuzelijst.
--
--  RECHTEN
--  De trigger bwf_reservering_beperkt() zet bij een locatiemanager alleen de
--  velden terug die daar met naam in staan. Deze twee kolommen staan daar
--  niet in, dus een locatiemanager mag zijn eigen naam eraan hangen. Dat is
--  de bedoeling: hij staat op locatie en weet wie de dienst draait.
--
--  Er wordt niets verwijderd, niets overschreven en geen bestaande regel
--  verandert. Draai je dit twee keer, dan doet de tweede keer niets.
-- ===========================================================================

begin;

alter table public.reserveringen
  add column if not exists locatiemanager_id uuid
    references public.wz_medewerkers(id) on delete set null,
  add column if not exists locatiemanager text;

comment on column public.reserveringen.locatiemanager_id is
  'De locatiemanager die de dienst bij deze reservering draaide. Koppeling naar '
  'wz_medewerkers.id. Niet te verwarren met kolom medewerker, die de beller van '
  'de welkomstcall bevat.';

comment on column public.reserveringen.locatiemanager is
  'Dezelfde persoon als locatiemanager_id, als leesbare naam. Wordt door het '
  'scherm tegelijk met de id gevuld; alleen om te tonen en te tellen.';

-- Voor het maandoverzicht: tellen per persoon per maand gaat over deze twee
-- kolommen samen met aankomst. Zonder index wordt dat bij duizenden regels
-- merkbaar traag.
create index if not exists reserveringen_locatiemanager_idx
  on public.reserveringen (locatiemanager_id, aankomst);

commit;

-- ===========================================================================
--  CONTROLE - draai dit erna
-- ===========================================================================
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'reserveringen'
--    and column_name in ('locatiemanager_id','locatiemanager','medewerker')
--  order by column_name;
--
--  verwacht: drie regels - locatiemanager (text, YES),
--  locatiemanager_id (uuid, YES) en de oude medewerker, onveranderd.
-- ===========================================================================

-- ===========================================================================
--  TERUGDRAAIEN
-- ===========================================================================
--  Eerst leegmaken, zodat er niets verdwijnt als je later van gedachten
--  verandert:
--
--  update public.reserveringen
--     set locatiemanager_id = null, locatiemanager = null
--   returning id;
--
--  Pas als je zeker weet dat je ze niet meer wilt:
--  drop index if exists public.reserveringen_locatiemanager_idx;
--  alter table public.reserveringen drop column locatiemanager;
--  alter table public.reserveringen drop column locatiemanager_id;
-- ===========================================================================
