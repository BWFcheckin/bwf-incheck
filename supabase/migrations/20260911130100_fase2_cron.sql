-- Fase 2 · migratie 6/6 — kanalen-sync elke 15 minuten via pg_cron + pg_net
-- Pas uitvoeren nadat de Edge Function kanalen-sync is gedeployed en een proefimport is goedgekeurd.
-- Het token wordt hier willekeurig aangemaakt en staat alleen in Vault. Direct daarna krijgt de
-- Edge Function dezelfde waarde als secret KANALEN_SYNC_TOKEN (zonder dat het token zichtbaar wordt).
-- Stoppen: select cron.unschedule('kanalen-sync');
begin;

select vault.create_secret(
         replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
         'kanalen_sync_token',
         'Token waarmee pg_cron de Edge Function kanalen-sync aanroept')
 where not exists (select 1 from vault.secrets where name = 'kanalen_sync_token');

select cron.schedule(
  'kanalen-sync',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://iuyjvtlauktnjprbmbjj.supabase.co/functions/v1/kanalen-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'kanalen_sync_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);

commit;
