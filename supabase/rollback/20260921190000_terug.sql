-- Terugdraaien van 20260921190000_meldingen_pogingen.sql
-- Let op: de Edge Function whatsapp-spoed schrijft in deze kolom. Zet die
-- eerst terug naar de vorige versie, anders mislukt elke melding.

begin;
alter table public.meldingen_verstuurd drop column if exists pogingen;
commit;
