-- Een foto per voorraadartikel (keuze Angela, 14-09-2026)
--
-- De tabel voorraad heeft nu deze kolommen:
--   id (text), naam (text), categorie (text), aantal (integer),
--   min_aantal (integer), leverancier (text), besteld (boolean),
--   bestel_aantal (integer), aangemaakt (timestamptz),
--   verwacht (date), locatie (text)
--
-- Er is geen veld voor een afbeelding. Deze migratie voegt er een toe:
-- een tekstveld met de link naar de foto, net zoals de suitefoto's op
-- de startpagina. Geen bestand in de database, alleen het adres.
--
-- VOEGT ALLEEN TOE. Geen bestaande kolom, rij, rechtenregel of trigger
-- verandert. Bestaande artikelen krijgen de waarde null en blijven
-- precies werken zoals nu; pagina's die de kolom niet kennen merken er
-- niets van.
--
-- Terugdraaien:
--   alter table public.voorraad drop column if exists foto;

begin;

alter table public.voorraad
  add column if not exists foto text;

comment on column public.voorraad.foto is
  'Link naar een afbeelding van het artikel (https://...). Leeg = geen foto.';

commit;
