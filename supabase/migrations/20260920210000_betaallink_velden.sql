-- ============================================================
-- Betaallink opslaan bij de reservering
-- NOG NIET UITGEVOERD - eerst laten zien aan Angela.
--
-- WAAROM DIT NODIG IS
-- De overstap naar de Payment Links API van Mollie (POST /v2/payment-links
-- in plaats van POST /v2/payments) heeft één groot gevolg: de Payment Links
-- API accepteert GEEN metadata-veld. Nagekeken in de documentatie van Mollie
-- op 20-09-2026: het verzoek kent amount, description, redirectUrl,
-- webhookUrl, expiresAt, reusable, allowedMethods, lines en adressen - maar
-- geen metadata.
--
-- De webhook koppelt een betaling nu aan een boeking via
-- metadata.reservering_id. Dat kan met payment links niet meer. En de
-- betaling zelf bevat geen verwijzing terug naar de link: in het
-- payment-object staat geen paymentLink of paymentLinkId.
--
-- De enige betrouwbare weg terug is dus: het payment-link-id bij de
-- reservering opslaan, en de webhook daarop laten zoeken. De webhook van een
-- payment link stuurt namelijk het link-id (pl_...), niet het betaling-id.
--
-- WAT DEZE MIGRATIE DOET
-- Drie kolommen op reserveringen, alle drie leeg toegestaan:
--   betaallink_id        het Mollie-kenmerk van de link, pl_xxxxxxxx
--   betaallink_url       de link zelf, om te versturen of opnieuw te openen
--   betaallink_verloopt  wanneer de link vervalt (aanmaakmoment + 48 uur),
--                        zodat het scherm "verlopen" kan tonen zonder eerst
--                        bij Mollie te hoeven navragen
--
-- Plus een index op betaallink_id, want de webhook zoekt daarop.
--
-- Er wordt niets verwijderd en er verandert geen enkele bestaande waarde.
-- Bestaande betalingen (20 stuks, waarvan 4 betaald en 16 verlopen) blijven
-- staan in mollie_betalingen en blijven werken: de webhook blijft ook het
-- oude soort melding (tr_...) verwerken.
-- ============================================================

begin;

alter table public.reserveringen
  add column if not exists betaallink_id       text,
  add column if not exists betaallink_url      text,
  add column if not exists betaallink_verloopt timestamptz;

create index if not exists reserveringen_betaallink_idx
  on public.reserveringen (betaallink_id)
  where betaallink_id is not null;

/* mollie_betalingen bewaart voortaan ook payment links. mollie_id is text, dus
   pl_... past er zonder wijziging in. Deze kolom zegt wat voor soort kenmerk
   het is, zodat een lijst de twee uit elkaar kan houden. */
alter table public.mollie_betalingen
  add column if not exists kenmerk_soort text;

commit;

-- Controle achteraf:
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'reserveringen'
--     and column_name like 'betaallink%';
-- Verwacht: betaallink_id text YES, betaallink_url text YES,
--           betaallink_verloopt timestamp with time zone YES.

-- ============================================================
-- TERUGDRAAIEN
--   begin;
--   drop index if exists public.reserveringen_betaallink_idx;
--   alter table public.reserveringen
--     drop column if exists betaallink_id,
--     drop column if exists betaallink_url,
--     drop column if exists betaallink_verloopt;
--   alter table public.mollie_betalingen drop column if exists kenmerk_soort;
--   commit;
-- De reserveringen en de betalingen zelf blijven staan; alleen de verwijzing
-- naar de betaallink verdwijnt.
-- ============================================================
