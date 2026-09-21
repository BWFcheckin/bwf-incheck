-- Terugdraaien van 20260921170000_spoedmelding_cron.sql
-- De taak stopt; het token in Vault blijft staan zodat je hem later weer kunt
-- aanzetten zonder de Edge-secret opnieuw te zetten.

select cron.unschedule('spoedmelding');

-- Wil je ook het token weg (dan moet de Edge-secret er later opnieuw op):
--   select vault.delete_secret(id) from vault.secrets where name = 'spoed_melding_token';
