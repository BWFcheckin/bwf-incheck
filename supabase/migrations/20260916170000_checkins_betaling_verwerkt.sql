-- VOORSTEL: bijhouden of de betaling van een incheckformulier verwerkt is
-- Geschreven 16-09-2026 (keuze Angela). NOG NIET UITGEVOERD.
--
-- Angela wil op een definitief incheckformulier kunnen aangeven dat de
-- betaling is verwerkt. Zo'n veld bestaat niet.
--
-- VOORAF GECONTROLEERD op de gekoppelde omgeving:
--   - checkins heeft 107 rijen: 93 met status 'definitief', 14 'concept'
--   - er is geen kolom betaling_verwerkt, betaling_verwerkt_op of
--     betaling_verwerkt_door
--   - wat er wel staat gaat over het BEDRAG of de WIJZE, niet over de
--     verwerking: aanbetaald (tekst met bedragen), betaalwijze (Contant 48,
--     iDEAL 54, ...), betalingen (jsonb), deelbetaling (bij alle 107 leeg),
--     split_betaling, opmerkingen_betaling
--   - checkins heeft al twee rechtenregels die ingelogde medewerkers alles
--     laten doen, dus een rechtenmigratie is NIET nodig
--
-- WAT ER GEBEURT: drie kolommen erbij, in dezelfde opzet als wz_overdracht
-- gebruikt voor afgehandeld_op en afgehandeld_door, zodat later te zien is wie
-- het wanneer heeft afgevinkt.
--
-- WAT ER NIET GEBEURT: geen bestaande kolom, rij, recht of trigger verandert.
-- Pagina's die de kolommen niet kennen merken er niets van.
--
-- GEVOLG OM TE WETEN: alle bestaande formulieren krijgen de waarde false, dus
-- 'nog niet verwerkt'. Dat is bewust de veilige kant: liever iets ten onrechte
-- als onverwerkt tonen dan ten onrechte als afgehandeld. De 93 definitieve
-- formulieren moeten dus eenmalig nagelopen worden.
--
-- Terugdraaien:
--   supabase/rollback/20260916170000_checkins_betaling_verwerkt_terugdraaien.sql
--
-- Uitvoeren met:
--   supabase db query --linked -f supabase/migrations/20260916170000_checkins_betaling_verwerkt.sql

begin;

alter table public.checkins
  add column if not exists betaling_verwerkt boolean not null default false;

alter table public.checkins
  add column if not exists betaling_verwerkt_op timestamptz;

alter table public.checkins
  add column if not exists betaling_verwerkt_door text;

comment on column public.checkins.betaling_verwerkt is
  'Is de betaling van dit formulier administratief verwerkt. Staat los van het bedrag en van de betaalwijze.';
comment on column public.checkins.betaling_verwerkt_op is
  'Wanneer het is afgevinkt.';
comment on column public.checkins.betaling_verwerkt_door is
  'Naam van degene die het afvinkte.';

commit;
