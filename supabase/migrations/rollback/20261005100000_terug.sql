-- Terugdraaien van 20261005100000_uitcheck.sql
--
-- LET OP: de tabel uitcheck BLIJFT staan. Daar staan verslagen in van wat er
-- bij het uitchecken met gasten is gebeurd - schade, klachten, zwarte lijst.
-- Dat is geen opmaak die je even weggooit. Alleen de rechten en de velden op
-- de klant gaan terug.
--
-- Wil Angela de tabel echt weg, dan eerst exporteren:
--   \copy (select * from public.uitcheck) to 'exports/uitcheck.csv' csv header
-- en daarna pas het laatste blok hieronder aanzetten.

begin;

-- 1. De rechtenregels op uitcheck terug, daarna pas de hulpfunctie: zolang een
--    policy hem gebruikt, laat Postgres hem niet weg.
drop policy if exists "uitcheck lezen"       on public.uitcheck;
drop policy if exists "uitcheck toevoegen"   on public.uitcheck;
drop policy if exists "uitcheck bijwerken"   on public.uitcheck;
drop policy if exists "uitcheck verwijderen" on public.uitcheck;
drop policy if exists "uitcheck rol vereist" on public.uitcheck;
drop function if exists public.bwf_mag_uitcheck(uuid);

-- 2. De velden op de klant. Staat er iemand op de zwarte lijst, dan gaat die
--    aanduiding hiermee weg - vandaar eerst tellen en pas daarna weghalen.
--    Is de uitkomst niet nul, stop dan en overleg met Angela.
-- select count(*) as op_de_zwarte_lijst from public.wz_klantbeheer where zwarte_lijst;

alter table public.wz_klantbeheer
  drop column if exists zwarte_lijst_door,
  drop column if exists zwarte_lijst_op,
  drop column if exists zwarte_lijst_reden,
  drop column if exists zwarte_lijst;

commit;

-- 3. Pas aanzetten na een export, en alleen als Angela het zegt.
--
-- begin;
-- drop trigger  if exists bwf_uitcheck_stempel on public.uitcheck;
-- drop function if exists public.bwf_uitcheck_stempel();
-- drop table    if exists public.uitcheck;
-- commit;
