-- Locatie per extra (keuze Angela, 16-09-2026)
--
-- De lijst met extra's kent geen vestiging. Almeerse en Lelystadse
-- arrangementen staan daardoor door elkaar in de keuzelijst. Deze migratie
-- voegt een kolom locatie toe met de waarden 'Almere', 'Lelystad' of leeg.
--
-- LEEG BETEKENT: overal beschikbaar. Dat is bewust de standaard.
-- De locatie wordt alleen ingevuld waar de tarievenpagina echt onderscheid
-- maakt. Bij twijfel blijft het veld leeg, want een verkeerd ingevulde locatie
-- laat een item VERDWIJNEN op de plek waar het wel verkocht wordt, en dat merk
-- je pas als iemand het mist.
--
-- DRAAI DEZE MIGRATIE NA 20260916090000_extras_prijzen_bijwerken.sql.
-- Een deel van de regels hieronder zet de locatie bij items die door die
-- migratie worden toegevoegd. Draai je hem eerder, dan raken die updates niets
-- en blijven die items gewoon op leeg staan (= overal beschikbaar).
--
-- De pagina vertaalt straks suite naar locatie:
--   angie -> Almere ; malina_jacuzzi en malina_deluxe -> Lelystad
--
-- VOEGT ALLEEN TOE. Geen bestaande kolom, rij, prijs of recht verandert.
-- Pagina's die de kolom niet kennen, merken er niets van.
--
-- Terugdraaien:
--   supabase/rollback/20260916100000_extras_locatie_terugdraaien.sql
--
-- Uitvoeren met:
--   supabase db query --linked -f supabase/migrations/20260916100000_extras_locatie.sql

begin;

alter table public.wz_extras
  add column if not exists locatie text
  check (locatie is null or locatie in ('Almere', 'Lelystad'));

comment on column public.wz_extras.locatie is
  'Leeg = bij elke suite beschikbaar. Anders alleen bij die vestiging. Suite angie hoort bij Almere, malina_jacuzzi en malina_deluxe bij Lelystad.';

-- ---------- alleen waar de tarievenpagina echt onderscheid maakt ----------

-- Bruidsnacht bestaat per suite apart
update public.wz_extras set locatie = 'Almere'   where naam = 'Bruidsnacht Angie';
update public.wz_extras set locatie = 'Lelystad' where naam in ('Bruidsnacht Jacuzzi', 'Bruidsnacht Zwembad');

-- Alleen op de Almeerse kaart
update public.wz_extras set locatie = 'Almere'
 where naam in ('Charcuterie board', 'Chicken platter', 'Tasting Tree', 'Champagne ontbijt', 'High Tea');

-- Alleen op de Lelystadse kaart
update public.wz_extras set locatie = 'Lelystad'
 where naam in ('Chicken wings menu', 'Massagetafel');

commit;
