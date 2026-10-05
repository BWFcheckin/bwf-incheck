-- ===========================================================================
--  Uren bijhouden per dag - Angela, 06-10-2026
-- ===========================================================================
--  "Graag een invoerveld maken waarin per dag met datum uren geplaatst kunnen
--   worden, keuze aantal uur of start- en eindtijd, zonder bedrag. Dit is om de
--   maanduren bij te houden."
--
--  Die uren horen in dezelfde tabel als de rest van het werk: dan staan ze in
--  hetzelfde maandoverzicht, dezelfde export en dezelfde filters. Er zijn maar
--  twee dingen voor nodig:
--
--  1. Twee tijdvelden, zodat "van 09:00 tot 12:00" bewaard blijft en niet
--     alleen het getal 3. Anders is achteraf niet meer na te gaan waar het
--     getal vandaan kwam.
--  2. tarief_id mag leeg zijn. Een urenregel hangt niet aan een tarief - er
--     hoort juist geen bedrag bij.
--
--  Er wordt niets verwijderd en geen bestaande regel verandert. Stond
--  tarief_id al op "mag leeg", dan doet die regel niets.
-- ===========================================================================

begin;

alter table public.wz_werkzaamheden
  add column if not exists begintijd time,
  add column if not exists eindtijd  time;

comment on column public.wz_werkzaamheden.begintijd is
  'Alleen bij urenregels die met een start- en eindtijd zijn ingevoerd. Leeg als er een aantal uur is ingetikt.';

alter table public.wz_werkzaamheden
  alter column tarief_id drop not null;

commit;

-- ===========================================================================
--  CONTROLE - draai dit erna
-- ===========================================================================
-- select column_name, is_nullable
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'wz_werkzaamheden'
--    and column_name in ('begintijd','eindtijd','tarief_id')
--  order by column_name;
--
--  verwacht: begintijd YES, eindtijd YES, tarief_id YES
-- ===========================================================================
