-- De Edge Function laten nakijken of de aanroep echt van pg_cron komt
-- ---------------------------------------------------------------------------
-- Hoort bij 20260921170000_spoedmelding_cron.sql.
--
-- De taak stuurt een token mee in de header x-spoed-token. Dat token staat in
-- Vault. De functie whatsapp-spoed moet diezelfde waarde kennen om te kunnen
-- vergelijken. Dat kan op twee manieren:
--
--   a. het token ook als Edge-secret zetten - dan staat hetzelfde geheim op
--      twee plekken en kunnen die uit de pas gaan lopen;
--   b. de functie in de kluis laten kijken - één plek, en niets om over te
--      schrijven als het token ooit gewisseld wordt.
--
-- Dit is b. De functie hieronder geeft precies dat ene geheim terug, niets
-- anders, en mag alleen door de service-rol worden aangeroepen. Een bezoeker
-- met de publieke sleutel (anon) of een ingelogde medewerker (authenticated)
-- krijgt hem niet; die rechten worden hieronder expliciet ingetrokken.
--
-- Niets wordt verwijderd of gewijzigd aan bestaande tabellen.

begin;

create or replace function public.bwf_spoed_token()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
    from vault.decrypted_secrets
   where name = 'spoed_melding_token'
$$;

comment on function public.bwf_spoed_token() is
  'Geeft het token waarmee pg_cron de Edge Function whatsapp-spoed aanroept. Alleen voor de service-rol.';

revoke all on function public.bwf_spoed_token() from public;
revoke all on function public.bwf_spoed_token() from anon;
revoke all on function public.bwf_spoed_token() from authenticated;
grant execute on function public.bwf_spoed_token() to service_role;

commit;

-- Terugdraaien (staat ook in rollback/20260921180000_terug.sql):
--   drop function if exists public.bwf_spoed_token();
