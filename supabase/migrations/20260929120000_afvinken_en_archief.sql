-- Lijsten afvinken, met een archief
-- ---------------------------------------------------------------------------
-- Angela, 29-09-2026: "ik wil dat al deze lijsten afvinkbaar worden en worden
-- gearchiveerd als ze zijn afgevinkt, later pas verwijderen, zodat als je per
-- ongeluk afvinkt je de taak nog wel kan vinden."
--
-- Het gaat om de vier lijsten op de dagstart van het VR-dashboard:
--   spoed        wat er vandaag met spoed moet
--   nieuw        boekingen die nog nagekeken moeten worden
--   extras       wat gasten zelf bijboekten via het incheckformulier
--   formulieren  formulieren die nog aan een reservering moeten
--
-- WAAROM EEN APARTE TABEL EN GEEN VLAGGETJE PER BRON
-- Die vier lijsten komen uit verschillende tabellen: reserveringen, wz_taken,
-- gast_aanmeldingen en checkins. In elk daarvan een kolom "afgevinkt" zetten
-- betekent vier migraties, vier plekken die uit de pas kunnen lopen, en het
-- vervuilt tabellen die ergens anders voor bedoeld zijn. Erger: bij "nog te
-- verwerken" zou een vlaggetje botsen met wat de lijst betekent - die lijst
-- vraagt juist of een boeking al is nagelopen.
--
-- Deze tabel ligt als een laag erboven: hij zegt alleen "dit item is van deze
-- lijst weggevinkt, door wie en wanneer". De bronnen blijven onaangeraakt.
--
-- AFVINKEN IS NIET VERWIJDEREN
-- Een afgevinkt item verdwijnt uit de lijst maar blijft in deze tabel staan.
-- Het scherm toont ze onder "Afgevinkt", waar ze met één tik weer terug te
-- zetten zijn. Dat is precies wat Angela vroeg: per ongeluk afvinken mag geen
-- ramp zijn.
--
-- De titel wordt meegeschreven. Dat is met opzet dubbel: verdwijnt de bron ooit
-- (een geannuleerde boeking, een verwijderd formulier), dan staat er in het
-- archief nog steeds wát je hebt afgevinkt in plaats van een kaal kenmerk.

begin;

create table if not exists public.bwf_afgevinkt (
  id             uuid primary key default gen_random_uuid(),
  /* Welke lijst. Een vaste lijst waarden, zodat er geen typefouten insluipen
     die later niemand meer terugvindt. */
  lijst          text not null,
  /* Het kenmerk van het item in die lijst: meestal de id van de reservering,
     de taak of het formulier. Tekst en geen uuid, want niet elke bron heeft
     een uuid - een formulier kan op zijn reserveringsnummer staan. */
  kenmerk        text not null,
  /* Waarover het ging, voor het archief. */
  titel          text,
  toelichting    text,
  afgevinkt_op   timestamptz not null default now(),
  afgevinkt_door text
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bwf_afgevinkt_lijst_check') then
    alter table public.bwf_afgevinkt add constraint bwf_afgevinkt_lijst_check
      check (lijst in ('spoed', 'nieuw', 'extras', 'formulieren'));
  end if;
end $$;

-- Eén item kan maar één keer afgevinkt zijn per lijst. Vinkt iemand hetzelfde
-- nog eens af, dan werkt de bestaande rij bij in plaats van er een tweede naast
-- te zetten.
create unique index if not exists bwf_afgevinkt_uniek_idx
  on public.bwf_afgevinkt (lijst, kenmerk);

-- Het scherm haalt per lijst op wat er afgevinkt is; daar staat deze index voor.
create index if not exists bwf_afgevinkt_lijst_idx
  on public.bwf_afgevinkt (lijst, afgevinkt_op desc);

comment on table public.bwf_afgevinkt is
  'Wat er van de dagstartlijsten is weggevinkt. Afvinken is geen verwijderen: '
  'het item blijft hier staan en is terug te zetten.';

-- ---------------------------------------------------------------------------
-- Rechten
-- ---------------------------------------------------------------------------
-- Zowel permissive als restrictive, want een tabel met alleen restrictive
-- policies weigert alles (dat is in dit project al een keer misgegaan, zie
-- 20260921120000_taken_rechten_herstel).
--
-- Iedereen met een toegangsrol mag afvinken en terugzetten: dit is dagelijks
-- werk en er gaat niets verloren. Verwijderen uit het archief blijft bij
-- kantoor - dat is het enige dat wél onomkeerbaar is.
alter table public.bwf_afgevinkt enable row level security;

drop policy if exists "afgevinkt lezen" on public.bwf_afgevinkt;
create policy "afgevinkt lezen" on public.bwf_afgevinkt
  for select to authenticated
  using ((select public.bwf_toegangsrol()) is not null);

drop policy if exists "afgevinkt toevoegen" on public.bwf_afgevinkt;
create policy "afgevinkt toevoegen" on public.bwf_afgevinkt
  for insert to authenticated
  with check ((select public.bwf_toegangsrol()) is not null);

drop policy if exists "afgevinkt bijwerken" on public.bwf_afgevinkt;
create policy "afgevinkt bijwerken" on public.bwf_afgevinkt
  for update to authenticated
  using ((select public.bwf_toegangsrol()) is not null)
  with check ((select public.bwf_toegangsrol()) is not null);

-- Terugzetten = de rij weghalen. Dat mag iedereen: het zet het item terug in
-- de lijst en dat is juist de bedoeling van een vergissing herstellen.
drop policy if exists "afgevinkt terugzetten" on public.bwf_afgevinkt;
create policy "afgevinkt terugzetten" on public.bwf_afgevinkt
  for delete to authenticated
  using ((select public.bwf_toegangsrol()) is not null);

drop policy if exists "afgevinkt rol vereist" on public.bwf_afgevinkt;
create policy "afgevinkt rol vereist" on public.bwf_afgevinkt
  as restrictive for all to authenticated
  using ((select public.bwf_toegangsrol()) is not null)
  with check ((select public.bwf_toegangsrol()) is not null);

commit;

-- ===========================================================================
--  CONTROLE - draai dit erna
-- ===========================================================================
--  1. De tabel bestaat en is leeg, met vijf rechtenregels.

select to_regclass('public.bwf_afgevinkt') is not null as tabel,
       (select count(*) from pg_policies where tablename = 'bwf_afgevinkt') as rechten;

--  2. Proef: twee keer hetzelfde afvinken mag maar één rij geven.

-- insert into public.bwf_afgevinkt (lijst, kenmerk, titel, afgevinkt_door)
--   values ('spoed', 'proef-1', 'Proefregel', 'proef')
--   on conflict (lijst, kenmerk) do update set afgevinkt_op = now();
-- insert into public.bwf_afgevinkt (lijst, kenmerk, titel, afgevinkt_door)
--   values ('spoed', 'proef-1', 'Proefregel', 'proef')
--   on conflict (lijst, kenmerk) do update set afgevinkt_op = now();
-- select count(*) as hoort_1_te_zijn from public.bwf_afgevinkt where kenmerk = 'proef-1';
-- delete from public.bwf_afgevinkt where kenmerk = 'proef-1';

-- ===========================================================================
--  OPRUIMEN - pas als het archief te vol wordt
-- ===========================================================================
--  Niets automatisch: Angela vroeg juist om "later pas verwijderen". Wil je
--  opruimen, kijk dan eerst wat er weggaat:
--
--    select lijst, count(*), min(afgevinkt_op) as oudste
--    from public.bwf_afgevinkt group by lijst order by lijst;
--
--  En ruim dan bewust op, bijvoorbeeld alles ouder dan een half jaar:
--
--    delete from public.bwf_afgevinkt where afgevinkt_op < now() - interval '6 months';

-- ===========================================================================
--  TERUGDRAAIEN
-- ===========================================================================
--  drop table if exists public.bwf_afgevinkt;
--
--  Dat wist alleen wat er is afgevinkt; de lijsten komen dan gewoon weer
--  volledig terug. Er gaat geen boeking, taak of formulier verloren - die
--  staan in hun eigen tabellen en zijn nooit aangeraakt.
