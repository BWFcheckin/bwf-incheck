# Wijzigingen 10-9-2026 — reservering overal aanpasbaar + welkomstcall

## Hoe het nu werkt
1. **Planyo blijft de hoofdbron** voor datum, tijd, personen en contactgegevens.
   In `reserveringen.html` → *Wijzigen* staat bij een Planyo-reservering het vinkje
   "Ook doorvoeren in Planyo". De Edge Function heeft daarvoor de nieuwe actie
   `update-reservation` (modify_reservation, set_reservation_notes, modify_user).
2. **Supabase (`res_koppeling`) is de centrale laag** voor alles wat Planyo niet
   heeft (arrangement, platform, notitie, welkomstcall) én als kopie van de
   aangepaste datum/tijd/naam/contact. Alle pagina's lezen die laag nu:
   - `reserveringen.html` (lijst + kalender) — deed dit al
   - `bwf-kalender.js` (dag/week/maand/jaar) — nieuw
   - `dashboard.html` (Lelystad: dagoverzicht, kalender, kaarten) — uitgebreid
     (eerder alleen tijd, nu ook datum, naam en contact)
3. **Automatisch verversen (BWFSync).** Na opslaan krijgen alle andere open
   pagina's/tabbladen een seintje en laden opnieuw (BroadcastChannel +
   localStorage). Geen handmatig verversen meer.

## Welkomstcall
- Zit in het wijzig-scherm van elke reservering: nodig ja/nee, gepland op,
  medewerker, status (nog te bellen / ingepland / afgerond / niet bereikbaar),
  terugbelafspraak, interne notities, knop **Bel gast** (tel:-link) en
  **Call afgerond**.
- Knop **Welkomstcalls** bovenin geeft de lijst met openstaande calls
  (filter: nog te doen / vandaag bellen / alles, per medewerker).
- Gekoppeld aan `res_sleutel` (= Planyo-nummer of hm-id) en `klant_id`.
- `dashboard.html`: de welkomstcall-kaart toont nu status, planning,
  medewerker, terugbelmoment en heeft Bel gast / Call afgerond / Niet bereikbaar.
- Bugfix: `maakWelkomstcall` in reserveringen.html gebruikte kolomnamen die
  niet bestaan (gast/aankomst/reservering) — aanmaken mislukte daardoor altijd.

## Uitrollen (in deze volgorde)
1. Supabase → SQL Editor → `supabase/migraties/2026-09-10_welkomstcalls_centraal.sql` uitvoeren.
2. Supabase → Edge Functions → `planyo-bridge` → nieuwe `index.ts` deployen.
3. GitHub (bwf-incheck) → upload `reserveringen.html`, `dashboard.html`,
   `bwf-kalender.js`, `bwf-planyo.js`.
   Let op: in pagina's die `bwf-planyo.js?v=10` laden het versienummer
   ophogen naar `?v=11` zodat browsers de nieuwe versie ophalen.

## Nog te controleren na uitrol
- Suite wisselen kan Planyo niet via modify_reservation; daarvoor blijft
  annuleren + nieuwe reservering nodig (de pagina bewaart de wijziging wel lokaal).
- `bwf-agenda.js` (niet meegestuurd) levert de gecombineerde agenda; als die
  Planyo cachet, zie je de Planyo-wijziging daar na de eerstvolgende ververs.
  De centrale laag laat intussen overal al de nieuwe gegevens zien.
