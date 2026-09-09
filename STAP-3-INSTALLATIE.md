# Stap 3 — gezamenlijke agenda beveiligen

De Google Apps Script-URL en agendasleutel staan na deze wijziging niet meer in de browsercode. Alleen een ingelogde gebruiker kan de nieuwe Supabase-functie aanroepen.

## 1. GitHub-bestanden uploaden

Upload/vervang deze bestanden in de hoofdmap van de website:

- `bwf-agenda.js`
- `bwf-kalender.js`
- `index.html`
- `reserveringen.html`
- `vandaag.html`
- `dagoverzicht.html`
- `dashboard.html`
- `dashboard-test.html`
- `vr2.html`
- `incheckformulier.html`

Upload daarnaast dit bestand in exact deze mapstructuur:

`supabase/functions/agenda-bridge/index.ts`

## 2. Twee Supabase-secrets toevoegen

Open Supabase → Edge Functions → Secrets en voeg toe:

- `AGENDA_PROXY_URL`: de huidige Google Apps Script-URL die eindigt op `/exec`
- `AGENDA_PROXY_KEY`: de huidige sleutel van die agenda-proxy

De standaardsecrets `SUPABASE_URL` en `SUPABASE_ANON_KEY` bestaan al en hoef je niet opnieuw toe te voegen.

## 3. Edge Function publiceren

Maak in Supabase een Edge Function met de naam `agenda-bridge`, plak de inhoud van `supabase/functions/agenda-bridge/index.ts` en publiceer/deploy de functie.

De functie-URL wordt:

`https://iuyjvtlauktnjprbmbjj.supabase.co/functions/v1/agenda-bridge`

## 4. Controleren

Wacht na de GitHub-upload ongeveer twee minuten, log opnieuw in en open:

`https://bwfcheckin.github.io/bwf-incheck/`

Ververs de pagina één keer volledig. De reserveringen uit de andere boekingskanalen moeten dan weer in de kalender verschijnen.

## 5. Belangrijk: oude sleutel vervangen

De oude sleutel heeft eerder in openbare browsercode gestaan en kan nog in de GitHub-geschiedenis voorkomen. Maak daarom na de succesvolle test een nieuwe lange sleutel, wijzig die zowel in Google Apps Script als bij het Supabase-secret `AGENDA_PROXY_KEY`, en publiceer Google Apps Script opnieuw.

Upload dit instructiebestand niet naar de openbare website; het is alleen voor de installatie.
