# Automatische HTML-mails in de BWF-huisstijl

## 1. E-maildienst

Maak een Resend-account aan, verifieer `bedenwellnessflevoland.nl` en maak een API key.

## 2. Supabase-secrets

Voeg bij Edge Functions → Secrets toe:

- `RESEND_API_KEY`: de API key van Resend
- `EMAIL_FROM`: `Bed & Wellness Flevoland <info@bedenwellnessflevoland.nl>`
- `EMAIL_REPLY_TO`: `info@bedenwellnessflevoland.nl`

Gebruik bij `EMAIL_FROM` uitsluitend een adres van een domein dat bij Resend is geverifieerd.

## 3. Edge Function

Maak een nieuwe Edge Function `mail-bridge`, vervang de inhoud door `supabase/functions/mail-bridge/index.ts` en klik op Deploy.

## 4. GitHub

Upload naar de hoofdmap en overschrijf waar nodig:

- `bwf-mail.js`
- `reservering-aanmaken.html`

Na het aanmaken van een reservering kun je kiezen uit: reserveringsbevestiging, betaalverzoek, wijziging, annulering, incheckinformatie, factuur en reviewverzoek. De mail wordt rechtstreeks verzonden; er opent geen lokaal mailprogramma.
