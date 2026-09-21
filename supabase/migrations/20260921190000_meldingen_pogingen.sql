-- Een mislukte melding mag het opnieuw proberen, maar niet eindeloos
-- ---------------------------------------------------------------------------
-- Fout in mijn eerste opzet (21-09-2026): een boeking werd als afgehandeld
-- weggeschreven zodra de functie hem één keer had gezien, óók als er niets
-- verstuurd was. Was het nummer voor die locatie nog niet ingevuld, of lag
-- Wati er even uit, dan kwam die boeking nooit meer terug en miste Angela de
-- melding zonder dat iemand dat merkte.
--
-- Vanaf nu slaat de functie alleen geslaagde meldingen over. Een mislukte
-- poging wordt geteld en opnieuw geprobeerd, tot MAX_POGINGEN. Zonder die
-- teller zou een boeking met een fout in het sjabloon elke vijf minuten
-- opnieuw langskomen tot de gast is aangekomen.
--
-- Niets wordt verwijderd; er komt alleen een kolom bij.

begin;

alter table public.meldingen_verstuurd
  add column if not exists pogingen integer not null default 0;

comment on column public.meldingen_verstuurd.pogingen is
  'Hoe vaak geprobeerd. De taak stopt met proberen na een paar mislukte pogingen.';

commit;

-- Terugdraaien (staat ook in rollback/20260921190000_terug.sql):
--   alter table public.meldingen_verstuurd drop column if exists pogingen;
