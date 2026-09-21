-- Elke vijf minuten kijken of er een spoedboeking is om te appen
-- ---------------------------------------------------------------------------
-- Hoort bij 20260921160000_spoedmelding_whatsapp.sql en bij de Edge Function
-- whatsapp-spoed. Zelfde opzet als de kanalen-sync die er al staat.
--
-- PAS UITVOEREN nadat:
--   1. de Edge Function whatsapp-spoed is gedeployed;
--   2. de Wati-secrets erop staan (WATI_ENDPOINT, WATI_TOKEN, WATI_TEMPLATE);
--   3. het sjabloon in Wati is goedgekeurd door Meta.
-- Draait hij eerder, dan doet de functie niets en schrijft hij "wati nog niet
-- ingesteld" terug. Er gaat niets stuk, maar het heeft ook geen zin.
--
-- Het token wordt hier aangemaakt en staat alleen in Vault. Daarna krijgt de
-- Edge Function dezelfde waarde als secret SPOED_MELDING_TOKEN:
--   supabase secrets set SPOED_MELDING_TOKEN=<de waarde uit Vault>
--
-- Stoppen zonder iets te verwijderen:  select cron.unschedule('spoedmelding');

begin;

select vault.create_secret(
         replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
         'spoed_melding_token',
         'Token waarmee pg_cron de Edge Function whatsapp-spoed aanroept')
 where not exists (select 1 from vault.secrets where name = 'spoed_melding_token');

select cron.schedule(
  'spoedmelding',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := 'https://iuyjvtlauktnjprbmbjj.supabase.co/functions/v1/whatsapp-spoed',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-spoed-token', (select decrypted_secret from vault.decrypted_secrets
                         where name = 'spoed_melding_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);

commit;

-- Het token uitlezen om het als Edge-secret te zetten (niet in de repo plakken):
--   select decrypted_secret from vault.decrypted_secrets where name = 'spoed_melding_token';
