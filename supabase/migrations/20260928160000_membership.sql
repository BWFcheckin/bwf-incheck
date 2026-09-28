-- Membershipprogramma
-- ---------------------------------------------------------------------------
-- Angela, 28-09-2026: "ik wil nu overgaan op het membershipprogramma inbouwen."
-- Gevraagd wat het inhoudt; het antwoord was:
--   * korting op elke boeking
--   * gratis of goedkopere extra's
--   * voorrang en aanbiedingen
--   * gratis lidmaatschap, loopt door, geen einddatum
--   * "ik wil beginnen met 1 niveau"
--
-- WAT ER AL WAS
-- wz_klantbeheer.member is een boolean die op false staat. Meer niet: geen
-- datum, geen nummer, geen niveau. dagoverzicht.html zoekt al naar een kolom
-- member_sinds (regel 959) om te bepalen of een aanmelding nog verwerkt moet
-- worden - die kolom bestond nooit, dus dat zoekje viel altijd leeg terug.
-- Die wordt hierbij echt gemaakt.
--
-- WAT ER BIJ KOMT OP wz_klantbeheer
--   member_sinds    date   wanneer iemand lid is geworden
--   member_nummer   text   het lidnummer, uniek
--   member_gestopt  date   wanneer iemand gestopt is; blijft leeg zolang hij lid is
--   member_niveau   text   nu voor iedereen 'basis'
--
-- Waarom member_niveau nu al, terwijl er maar één niveau is: Angela zei "ik wil
-- beginnen met 1 niveau", dus er komen er meer. De kolom nu toevoegen kost
-- niets en scheelt straks een migratie op een tabel die dan in gebruik is.
-- Zolang er één niveau is staat overal 'basis' en merkt niemand er iets van.
--
-- Waarom member_gestopt en niet gewoon member op false: dan weet je niet meer
-- dat iemand ooit lid was, en ook niet sinds wanneer niet meer. Een gestopt
-- lid blijft herkenbaar, precies zoals de regel "verwijder niets" bedoelt.
--
-- WAAROM GEEN APARTE TABEL
-- Een tabel wz_members zou de gegevens netter scheiden, maar erft geen rechten
-- en zou alle policies van wz_klantbeheer moeten herhalen. Dat is in dit
-- project al een keer misgegaan (zie 20260921120000_taken_rechten_herstel).
-- Kolommen op de klant zelf erven de bestaande regels ongewijzigd.
--
-- DE REGELS VAN HET PROGRAMMA staan NIET in deze tabel maar in `instellingen`,
-- als sleutel/waarde - dezelfde plek waar de reviewlinks en de sjablonen al
-- staan. Zo kun je het kortingspercentage zelf aanpassen in het beheerscherm
-- zonder dat er een migratie aan te pas komt.
--
-- Er wordt niets verwijderd en geen bestaande waarde overschreven.

begin;

alter table public.wz_klantbeheer
  add column if not exists member_sinds date,
  add column if not exists member_nummer text,
  add column if not exists member_gestopt date,
  add column if not exists member_niveau text;

-- Twee klanten kunnen niet hetzelfde lidnummer hebben. Lege waarden botsen
-- niet met elkaar, dus klanten zonder lidmaatschap blijven gewoon naast
-- elkaar bestaan.
create unique index if not exists wz_klantbeheer_member_nummer_idx
  on public.wz_klantbeheer (member_nummer) where member_nummer is not null;

-- Zoeken op "wie zijn er lid" gaat straks over alle klanten heen.
create index if not exists wz_klantbeheer_member_idx
  on public.wz_klantbeheer (member) where member = true;

-- Alleen niveaus die het scherm kent. Nu is dat er één; komt er later brons of
-- goud bij, dan gaat deze regel mee in die migratie.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wz_klantbeheer_member_niveau_check'
  ) then
    alter table public.wz_klantbeheer
      add constraint wz_klantbeheer_member_niveau_check
      check (member_niveau is null or member_niveau in ('basis'));
  end if;
end $$;

-- Wie al als member aangevinkt staat, is dat vanaf nu ook echt: niveau erbij
-- en een begindatum. De datum van aanmaken is het eerlijkste dat we hebben -
-- wanneer ze zich echt aanmeldden is nergens vastgelegd.
update public.wz_klantbeheer
   set member_niveau = 'basis',
       member_sinds  = coalesce(member_sinds, aangemaakt::date, current_date)
 where member = true
   and member_niveau is null;

comment on column public.wz_klantbeheer.member_sinds is
  'Datum waarop de klant member werd.';
comment on column public.wz_klantbeheer.member_nummer is
  'Lidnummer, uniek. Leeg zolang er geen lidmaatschap is.';
comment on column public.wz_klantbeheer.member_gestopt is
  'Datum waarop het lidmaatschap eindigde. Leeg zolang het loopt.';
comment on column public.wz_klantbeheer.member_niveau is
  'Nu altijd basis. Ruimte voor meer niveaus zonder nieuwe migratie.';

-- ---------------------------------------------------------------------------
-- De regels van het programma, als instelling. Alles wat je later wilt kunnen
-- bijstellen staat hier en niet in de code.
-- ---------------------------------------------------------------------------
insert into public.instellingen (sleutel, waarde)
select v.sleutel, v.waarde
from (values
  ('member_korting_procent', '10'),
  ('member_korting_over',    'kamer'),
  ('member_gratis_extras',   ''),
  ('member_voorwaarden',     'Als member krijg je korting op elke boeking, '
                          || 'voordeel op extra''s en als eerste bericht bij '
                          || 'aanbiedingen en drukke data.'),
  ('member_nummer_start',    '1001')
) as v(sleutel, waarde)
where not exists (
  select 1 from public.instellingen b where b.sleutel = v.sleutel
);

commit;

-- ===========================================================================
--  CONTROLE - draai dit erna
-- ===========================================================================
--  1. De vier nieuwe kolommen horen er te staan.

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'wz_klantbeheer'
  and column_name like 'member%'
order by column_name;

--  2. De vijf instellingen. Het percentage staat op 10 - pas dat aan in het
--     beheerscherm als je een ander getal wilt, niet hier.

select sleutel, waarde from public.instellingen
where sleutel like 'member\_%' order by sleutel;

--  3. Hoeveel klanten nu als member tellen, en sinds wanneer.

select count(*) as members,
       min(member_sinds) as langst_lid,
       count(*) filter (where member_nummer is null) as zonder_lidnummer
from public.wz_klantbeheer where member = true;

-- ===========================================================================
--  TERUGDRAAIEN
-- ===========================================================================
--  Zie rollback/20260928160000_membership_terug.sql
