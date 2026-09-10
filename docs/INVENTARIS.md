# Inventaris — Supabase en pagina's

Fase 0 van `PLAN-AGENDA-EN-RESERVERINGEN.md` · opgesteld 11-09-2026 · project `iuyjvtlauktnjprbmbjj`

**Bron:** de live database (via `supabase db query --linked`: tabellen, kolommen, constraints, policies, rij-aantallen) en de code op `main` (commit `e6f1aa5`). Voor `vr2.html` is de versie uit git gebruikt, omdat het bestand in de werkmap leeg is (zie 1.1). Er is **niets verwijderd of gewijzigd** in Supabase.

Afkortingen in de tabellen: **L** = leest, **S** = schrijft. Paginanamen zonder `.html`. ✗ = tabel bestaat niet in de database.

---

## 1. Eerst dit — besluiten en risico's vóór fase 1

### 1.1 `vr2.html` was lokaal leeg — hersteld
In de werkmap op de Mac was `vr2.html` 0 bytes, terwijl hij in git en op GitHub Pages heel was (491 KB, 8.732 regels). Op 11-09-2026 hersteld met `git restore vr2.html`. Het lege bestand `main` in de root is verwijderd.

### 1.2 Geheime sleutel staat open in publieke pagina's
De URL en sleutel van de Google Apps Script-agendaproxy staan als platte tekst in:
`dashboard.html`, `dagoverzicht.html`, `incheckformulier.html`, en ook in `incheckformulier-test.html`, `vandaag-test.html` en `archief/dashboard-test.html`.

Het zijn **precies dezelfde waarden** als de Supabase-secrets `AGENDA_PROXY_KEY` en `AGENDA_PROXY_URL` (gecontroleerd via de hash). Het afschermen via `agenda-bridge` beschermt dus niets zolang de sleutel niet vervangen is. De sleutel staat sinds 05-09-2026 (commit `d4ee406`) in de git-historie van een publieke repo.

`COMMUNICATIE_SLEUTEL` in `dashboard.html` is géén geheim: het is de naam van een localStorage-sleutel.

**Voorstel:** in Apps Script een nieuwe sleutel zetten, die alleen in het Supabase-secret bewaren, en de drie live pagina's via `bwf-agenda.js` / `agenda-bridge` laten lopen (zoals `vandaag.html` al doet).

### 1.3 De code gebruikt tabellen die niet bestaan
| Tabel ✗ | Gebruikt door | Gevolg |
|---|---|---|
| `bwf_instellingen` | `reserveringen` (L/S: sjablonen gastlink/annulering/wijziging), `dagoverzicht` (L/S: snelle links) | Mislukt stil. Instellingen blijven alleen in de browser van degene die ze instelt. De echte tabel heet `instellingen`. Het plan (§1 en spelregel 3) noemt ook `bwf_instellingen`. |
| `gast_blacklist` | `reserveringen` (L/S) | De zwarte lijst werkt niet: lezen geeft een lege lijst, opslaan geeft een foutmelding. |
| `wz_planning` | `vr2` (L) | Valt terug op `planning`, dus geen probleem. |

### 1.4 Rechten: iedere ingelogde gebruiker mag alles
RLS staat op alle 50 tabellen aan. Maar bijna elke policy is `authenticated … using true`: **elk van de 9 accounts** (ook het urenstaat-account) kan alle gastgegevens, handtekeningen, betalingen en de administratie lezen, wijzigen en verwijderen. De rolscheiding uit plan §5 bestaat nu alleen in de menu's.

| Uitzondering | Regel |
|---|---|
| `welkomstcalls` (0 rijen, ongebruikt) | alleen eigen calls (`medewerker = auth.uid()`) of beheerder via `is_beheerder()` |
| `bwf_rollen` | eigen rij of beheerder |
| `documenten` | **anon mag lezen.** Bevat huisregels, voorwaarden, handboekfoto's en prijslijsten, geen gastgegevens. Nodig voor `gast`. |
| `gast_aanmeldingen` | **anon mag toevoegen** (gastformulier via gastlink) |
| `backup_*` (4), `bwf_gastlinks` | RLS zonder policies: alleen de service role (edge functions) kan erbij |
| Storage-bucket `documenten` | **public**: 5 bestanden (check-in-kaarten, huisregels), iedereen met de link kan ze openen |

### 1.5 Er zijn 50 tabellen, niet 14 — veel overlap
| Onderwerp | Tabellen (rijen) | Wat er echt gebruikt wordt |
|---|---|---|
| Personeel en rollen | `wz_medewerkers` (8), `medewerkers` (6), `staff` (6), `bwf_gebruikers` (9), `bwf_rollen` (5) | Alle vijf behalve `bwf_gebruikers`. De rolnamen verschillen per tabel: `medewerker`/`eigenaar`, `locatie manager`/`vr assistent`/`inval kracht gastvrouw`, `beheerder`, `wz_medewerkers`/`Administratie`. |
| Reserveringen | `reservations` (36), `res_koppeling` (74), `wz_reservering_klanten` (8), plus Planyo en Google Agenda live | Alle drie. `res_koppeling.bron` = `agenda` (71), `handmatig` (2), `blokkade` (1). |
| Welkomstcalls | `wz_welkomstcalls` (49) · `welkomstcalls` (0) | Alleen `wz_welkomstcalls`. `welkomstcalls` is een nieuwere opzet met RLS per medewerker, maar geen pagina gebruikt hem. |
| Overdracht | `overdracht` (1, dashboard) · `wz_overdracht` (0, vr2/vrdashboard) | Beide, gescheiden per dashboard. |
| Documenten | `documenten` (36, base64 in de tabel, 15 MB) · `wz_documenten` (4, links naar Storage) | Beide. |
| Uren | `uren_registratie` (34, uren-ruth) · `uren_registraties` (0), `personeel_diensten` (0), `vakantie_aanvragen` (0) | Alleen `uren_registratie`. |
| Instellingen | `instellingen` (9) · `wz_klantbeheer_instellingen` (0) · ✗ `bwf_instellingen` | `instellingen` (dashboard, incheckformulier) en `wz_klantbeheer_instellingen` (klantbeheer). |

### 1.6 Punten die het datamodel in het plan raken
- **`voorraad` bestaat al** (88 rijen: naam, categorie, aantal, min_aantal, leverancier, besteld, bestel_aantal, verwacht). §3.5 moet deze tabel uitbreiden, niet opnieuw aanmaken. `voorraad_mutaties` bestaat nog niet.
- **`wz_medewerkers.rol` bestaat al** (waarden `medewerker` ×7, `eigenaar` ×1), plus kolom `auth_id`. §3.4 moet kiezen welke van de vijf personeelstabellen blijft.
- **Suitenamen zijn niet eenduidig.** Gevonden waarden:

  | Tabel | Waarden |
  |---|---|
  | `reservations` / `checkins` | `angie`, `deluxe`, `jacuzzi` (ook met hoofdletter) |
  | `bwf_tariefblokken` | `angie`, `jacuzzi`, `zwembad` |
  | `wz_welkomstcalls` | `Suite Angie Almere`, `Malina Zwembad`, `Malina Jacuzzi` |
  | `psm_administratie` | `PSA`, `PSM`, `PSMD` |
  | `planning` | `Lelystad Malina` |

  **Besloten 11-09-2026:** *Malina Deluxe* en *Malina Zwembad* zijn dezelfde suite. Overal `angie`, `malina_jacuzzi`, `malina_deluxe`; de omzettabel staat in het plan (§3.1).
- **Kanaal wordt nu al vastgelegd** in `checkins.boeking_via`: `Prive sauna` 12, `Booking.com` 2, `Telefonisch` 2, `Origineel overnachten` 1, leeg 71. Er is nog geen kanaal-waarde voor telefonisch; nu staat `handmatig` in §3.1.
- **Bronnen voor het migratiescript:** `reservations`, `res_koppeling` (incl. borg- en welkomstcall-kolommen), `wz_reservering_klanten`, `checkins.reservation_id` / `checkins.gekoppelde_reservering`, `wz_welkomstcalls.res_sleutel`.

### 1.7 Edge Functions
| Functie | In repo? | Aangeroepen door | Tabellen | Secrets |
|---|---|---|---|---|
| `planyo-bridge` (v17, actief) | ja (gelijk aan gedeployde versie) | dashboard, reserveringen, reservering-aanmaken | `bwf_betalingen` (service role) + Planyo + Mollie | PLANYO_API_KEY, MOLLIE_API_KEY |
| `agenda-bridge` (v4) | **nee** | agenda, vandaag, reserveringen, vr2 (via `bwf-agenda.js`) | – (Apps Script-proxy) | AGENDA_PROXY_URL/KEY (zie 1.2) |
| `gastlink-bridge` (v1) | **nee** | gast, reservering-aanmaken (via `bwf-gastlink.js`) | `bwf_gastlinks` | service role |
| `mollie-create-payment` (v6) | **nee** | vr2 | – | MOLLIE_API_KEY |
| `mollie-webhook` (v6) | **nee** | Mollie | `mollie_betalingen` (upsert) | MOLLIE_API_KEY, service role |
| `mail-bridge` | nee | reservering-aanmaken (via `bwf-mail.js`) | – | **niet gedeployed: aanroep mislukt** |

De broncode van alle gedeployde functies staat nu in de export. De map `~/bwf-incheck/supabase/functions/planyo-bridge/` in de repo is een **oudere** kopie van `planyo-bridge` (zonder de afhandeling van bestaande Planyo-klanten).

### 1.8 Terloops gevonden fouten (voor fase 4/5)
- `index.html` laadt `bwf-start.js`, dat niet bestaat. De kalender (`bwf-kalender.js`) krijgt daar geen login-token en geen Planyo- of agenda-bron, dus toont waarschijnlijk niets.
- `reservering-aanmaken.html` linkt naar `beschikbaarheid2.html`, dat alleen in `archief/` staat (kapotte link; `agenda.html` is de opvolger). Laadt ook nog `bwf-planyo.js?v=10` (elders `v=11`).
- `dagstart.html` zegt "leest alleen", maar schrijft taken en welkomstcalls. De koppeling naar `res_koppeling` is een POST zonder `merge-duplicates`, dus die geeft een fout als de reservering al een koppeling heeft.
- `klantbeheer.html`, `vrdashboard.html` en `administratie-michel.html` vallen bij een verbindingsfout stil terug op localStorage. Klanten, nachtregister of administratie staan dan alleen in die ene browser.
- Elke pagina bewaart de login onder een eigen sleutel (`bwf_auth`, `wz_sessie`, `sb-…-auth-token`, `bwf_vandaag_sessie`, `urenstaat-ruth-sessie`, `psm-admin-sessie`), dus steeds opnieuw inloggen per pagina.
- `inlogslotklantbeheer.html` bevat het inlogblok twee keer (kapotte commentaarregel).
- `bwf-reservering-extra.js` wordt door geen enkele pagina geladen.
- `supabase/.temp/` staat in git (geen wachtwoord, maar hoort niet in de repo).
- `README.md` beschrijft de andere repo (`administratie-mbthere`), niet deze.

---

## 2. Export (11-09-2026)

Locatie: `exports/2026-09-11/` (staat in `.gitignore`, bevat persoonsgegevens — niet delen).

| Onderdeel | Inhoud |
|---|---|
| `<tabel>.csv` | alle 50 tabellen, kolommen in database-volgorde; jsonb als JSON-tekst |
| `json/<tabel>.json` | dezelfde data zonder verlies (null ≠ lege tekst, getallen, jsonb) |
| `_VERSLAG.txt` | per tabel: rijen in database vs. rijen in export — **alle 50 gelijk** |
| `_schema/` | kolommen + constraints, policies (59), functies (2), views (2), triggers, storage-buckets en -objecten, auth-gebruikers (id, e-mail, data — **zonder** wachtwoord-hashes) |
| `storage/documenten/` | de 5 bestanden uit de bucket (grootte gecontroleerd) |
| `edge-functions/` | broncode van de 5 gedeployde functies |

**Niet in deze export:** een herstelbare `pg_dump` (schema-SQL). Op de Mac ontbreken Docker en `pg_dump`. Te installeren met `brew install libpq`; daarna werkt `supabase db dump --linked`. Wel in de export: alle data en de schema-informatie hierboven.

**Opnieuw exporteren** (vóór elke drop/delete, spelregel 2): per tabel `supabase db query --linked "select * from public.<tabel>"` en omzetten naar CSV/JSON. Rij-aantallen vergelijken met `count(*)`.

---

## 3. Tabellen per onderwerp — wie gebruikt wat

Alleen de actieve pagina's in de root (archief en testpagina's: zie §5).

### Reserveringen en agenda
| Tabel | Rijen | L | S |
|---|---|---|---|
| `reservations` | 36 | agenda, kalender¹, dashboard, vr2, reserveringen, reservering-aanmaken, dagstart, vandaag, controle, incheckformulier, klantbeheer | reserveringen (insert/update/delete), reservering-aanmaken (insert), vr2 (update), dashboard (delete, alleen handmatig) |
| `res_koppeling` | 74 | agenda, kalender¹, dashboard, vr2, reserveringen, reservering-aanmaken, dagstart, vandaag, controle, incheckformulier, klantbeheer | agenda (upsert/delete blokkades), dashboard, vr2, vandaag, reservering-aanmaken (upsert; ook delete), reserveringen (insert/update), dagstart (insert) |
| `wz_reservering_klanten` | 8 | – | reserveringen, reservering-aanmaken (upsert) |
| `bwf_tariefblokken` | 32 | agenda, reservering-aanmaken | – |
| `bwf_producten` | 35 | reservering-aanmaken | – |
| `planning` | 38 | agenda, kalender¹, dashboard, vr2, vandaag, controle | dashboard (insert/update/delete) |

¹ `bwf-kalender.js`, geladen door `index.html`.

### Incheck en gasten
| Tabel | Rijen | L | S |
|---|---|---|---|
| `checkins` | 88 | dashboard, vr2, reserveringen, vandaag, controle, incheckformulier, klantbeheer | incheckformulier (insert/update/delete) |
| `gast_aanmeldingen` | 7 | dashboard, vr2, dagoverzicht, dagstart, vandaag, incheckformulier | gast (insert, anoniem), incheckformulier (update/delete), dashboard (update) |
| `bwf_gastlinks` | 2 | `gastlink-bridge` | `gastlink-bridge` |
| `wz_gastenregister` | 0 | vr2, vrdashboard | vr2, vrdashboard (insert/delete) |
| `wz_belastingtarief` | 3 | vr2, vrdashboard | vr2, vrdashboard (insert/update) |
| `schade` | 0 | dashboard | dashboard (insert) |

### Klanten
| Tabel | Rijen | L | S |
|---|---|---|---|
| `wz_klantbeheer` | 16 | klantbeheer, vr2, dashboard, reserveringen, reservering-aanmaken, dagoverzicht, incheckformulier | klantbeheer (upsert/delete), vr2 (alles), incheckformulier (upsert), reserveringen, reservering-aanmaken (insert/update), dashboard (insert) |
| `wz_klantbeheer_instellingen` | 0 | klantbeheer | klantbeheer (upsert) |

### Welkomstcalls, taken en werk VR-assistent
| Tabel | Rijen | L | S |
|---|---|---|---|
| `wz_welkomstcalls` | 49 | vr2, dashboard, reserveringen, dagstart, vandaag, index | vr2 (alles), dagstart (alles), dashboard, reserveringen (upsert/update) |
| `wz_taken` | 54 | vr2, vrdashboard, dashboard, dagoverzicht, dagstart, index | vr2, vrdashboard, dagstart (alles), dashboard (insert/update), reserveringen (insert) |
| `wz_werkzaamheden` | 0 | vr2, vrdashboard | vr2, vrdashboard (alles) |
| `wz_tarieven` | 9 | vr2, vrdashboard | vr2, vrdashboard (alles) |
| `wz_extras` | 19 | vr2 | vr2 (alles) |
| `wz_gesprekken` | 0 | vr2 | vr2 (insert) |
| `wz_bellijsten`, `wz_bel_items` | 0, 0 | vr2, vrdashboard | vr2, vrdashboard |
| `wz_belscripts`, `wz_belscript_stappen` | 1, 18 | vr2, vrdashboard | vr2, vrdashboard |
| `wz_links` | 16 | vr2, vrdashboard | vr2, vrdashboard |
| `wz_documenten` | 4 | vr2, vrdashboard | vr2, vrdashboard (+ upload naar bucket `documenten`) |
| `wz_overdracht` | 0 | vr2, vrdashboard | vr2, vrdashboard |
| `welkomstcalls` | 0 | – | – |

### Personeel en rollen
| Tabel | Rijen | L | S |
|---|---|---|---|
| `wz_medewerkers` | 8 | `bwf-account.js` (agenda, dagstart, vandaag), vr2, vrdashboard, dashboard, reserveringen, dagoverzicht, dagstart, vandaag | vr2, vrdashboard (alles) |
| `medewerkers` | 6 | dashboard, kalender¹, vr2, reserveringen (reserve), controle | dashboard (alles) |
| `staff` | 6 | incheckformulier | – |
| `bwf_rollen` | 5 | index; functie `is_beheerder()` | – |
| `bwf_gebruikers` | 9 | – | – |
| `uren_registratie` | 34 | uren-ruth | uren-ruth (alles) |
| `uren_registraties`, `personeel_diensten`, `vakantie_aanvragen` | 0 | – | – |

### Voorraad, overdracht, documenten, instellingen
| Tabel | Rijen | L | S |
|---|---|---|---|
| `voorraad` | 88 | dashboard, dagoverzicht, dagstart, controle | dashboard (alles) |
| `overdracht` | 1 | dashboard, controle | dashboard (alles) |
| `documenten` | 36 | incheckformulier, gast (anoniem), controle | – |
| `instellingen` | 9 | dashboard, incheckformulier, controle | dashboard, incheckformulier (upsert) |

### Geld en administratie
| Tabel | Rijen | L | S |
|---|---|---|---|
| `psm_administratie` | 215 | administratie-michel | administratie-michel (alles) |
| `bwf_betalingen` | 2 | `planyo-bridge` | `planyo-bridge` |
| `mollie_betalingen` | 0 | – | `mollie-webhook` (upsert) |
| `mollie_koppeling` | 0 | – | – |
| `facturen` | 0 | – (functie `volgend_factuurnummer()`) | – |

### Back-ups (9–10 sep)
`backup_res_koppeling_20260910` (72), `backup_reservations_20260910` (49), `backup_taken_20260909` (50), `backup_welkomstcalls_20260909` (45) — door niets gebruikt.

### Views
`v_welkomstcalls_open` (op `wz_welkomstcalls` + `res_koppeling`) en `urenregistratie_welkomstcalls` (op `welkomstcalls` + `bwf_rollen`) — door geen pagina gebruikt.

---

## 4. Per pagina

| Pagina | Leest | Schrijft | Verder |
|---|---|---|---|
| `index` | bwf_rollen, wz_taken, wz_welkomstcalls; via kalender: reservations, planning, medewerkers, res_koppeling | – | supabase-js; iframe vandaag; ✗ `bwf-start.js` |
| `vr2` | 16 `wz_*`-tabellen (medewerkers, tarieven, taken, werkzaamheden, documenten, bellijsten, bel_items, links, overdracht, gastenregister, belastingtarief, belscripts, belscript_stappen, klantbeheer, extras, welkomstcalls), wz_gesprekken, reservations, res_koppeling, gast_aanmeldingen, checkins, medewerkers, planning | alle 16 `wz_*`, wz_gesprekken, reservations, res_koppeling | agenda-bridge, mollie-create-payment, upload bucket `documenten`, Gmail-API |
| `dashboard` | medewerkers, planning, voorraad, overdracht, instellingen, reservations, res_koppeling, wz_klantbeheer, wz_medewerkers, checkins, wz_welkomstcalls, wz_taken, gast_aanmeldingen, schade | medewerkers, planning, voorraad, overdracht, instellingen, reservations, res_koppeling, wz_klantbeheer, wz_welkomstcalls, wz_taken, gast_aanmeldingen, schade | planyo-bridge; **Apps Script-sleutel in code**; iframes vandaag, klantbeheer |
| `agenda` | bwf_tariefblokken, reservations, res_koppeling, planning, wz_medewerkers | res_koppeling | agenda-bridge |
| `reserveringen` | wz_medewerkers, medewerkers, reservations, res_koppeling, wz_klantbeheer, checkins, wz_welkomstcalls, ✗ gast_blacklist, ✗ bwf_instellingen | reservations, res_koppeling, wz_klantbeheer, wz_reservering_klanten, wz_welkomstcalls, wz_taken, ✗ gast_blacklist, ✗ bwf_instellingen | planyo-bridge, agenda-bridge |
| `reservering-aanmaken` | bwf_tariefblokken, bwf_producten, reservations, res_koppeling, wz_klantbeheer | reservations, res_koppeling, wz_klantbeheer, wz_reservering_klanten | planyo-bridge (incl. Mollie), gastlink-bridge, ✗ mail-bridge |
| `dagoverzicht` | wz_medewerkers, wz_taken, voorraad, gast_aanmeldingen, wz_klantbeheer, ✗ bwf_instellingen | ✗ bwf_instellingen | **Apps Script-sleutel in code** |
| `dagstart` | wz_taken, wz_welkomstcalls, voorraad, gast_aanmeldingen, reservations, res_koppeling, wz_medewerkers | wz_taken, wz_welkomstcalls, res_koppeling | iframe vr2 |
| `vandaag` | wz_medewerkers, reservations, res_koppeling, checkins, gast_aanmeldingen, wz_welkomstcalls, planning | res_koppeling | agenda-bridge |
| `controle` | medewerkers, planning, voorraad, overdracht, instellingen, reservations, res_koppeling, checkins, documenten | – | verbindingstest |
| `incheckformulier` | staff, documenten, checkins, gast_aanmeldingen, wz_klantbeheer, reservations, res_koppeling, instellingen | checkins, gast_aanmeldingen, wz_klantbeheer, instellingen | upload bucket `documenten`; **Apps Script-sleutel in code** |
| `gast` | documenten | gast_aanmeldingen | anoniem; gastlink-bridge |
| `klantbeheer` | wz_klantbeheer, wz_klantbeheer_instellingen, reservations, res_koppeling, checkins | wz_klantbeheer, wz_klantbeheer_instellingen | terugval op localStorage |
| `vrdashboard` | 13 `wz_*` (als vr2, zonder klantbeheer, extras, welkomstcalls) | dezelfde 13 | upload bucket `documenten`; opgevolgd door vr2, maar nog gelinkt vanuit index en dagstart |
| `uren-ruth` | uren_registratie | uren_registratie | vast account `uren@…` |
| `administratie-michel` | psm_administratie | psm_administratie | terugval op localStorage |
| `wachtwoord` | – | – | Auth: nieuw wachtwoord |
| `inlogslotklantbeheer`, `review-link-versturen` | – | – | losse codeblokken om te plakken, geen tabellen |

**Gedeelde scripts:** `bwf-shell.js` (menu, geen netwerk), `bwf-account.js` (wz_medewerkers, wachtwoord vergeten), `bwf-kalender.js` (index), `bwf-agenda.js`, `bwf-planyo.js`, `bwf-gastlink.js`, `bwf-mail.js`; `bwf-reservering-extra.js` wordt nergens geladen.

---

## 5. Opruimvoorstel — nog niets verwijderd, eerst akkoord Angela

Alles hieronder staat in de git-historie, dus is na verwijderen terug te halen.

| Item | Wat het is | Voorstel |
|---|---|---|
| `archief/Uren-ruth2026.html` | byte-identiek aan `uren-ruth.html` | verwijderen |
| `archief/dashboard (1).html`, `dashboard (2).html`, `vrdashboard (1).html`, `vr2 (1).html`, `bwf-reserveringen-dashboard.html`, `dashboard-prototype.html`, `bwf-incheck-app-licht.html` | oudere voorlopers van dashboard / vr2 / reserveringen / incheckformulier; nergens gelinkt | verwijderen |
| `archief/dashboard-test.html` | oudere versie van dashboard; bevat de sleutel uit 1.2. Heeft 3 dingen die live mist: handmatige `tijd_in`/`tijd_uit`, welkomstcall-status en "Besproken" op de reserveringskaart | eerst bevestigen dat die weg mogen, dan verwijderen |
| `archief/beschikbaarheid2.html` | voorloper van `agenda.html` | link in reservering-aanmaken naar `agenda.html` zetten, dan verwijderen |
| `archief/boeking.html` | gastformulier "Je verblijf aanmelden", schrijft naar `wz_klantbeheer` | **vragen**: is dit de "boeking-flow" uit fase 7? |
| `incheckformulier-test.html`, `klantbeheer-test.html`, `vandaag-test.html` | oudere kopieën; bevatten niets wat live mist; nergens gelinkt; twee bevatten de sleutel | verwijderen |
| `vrdashboard.html` | opgevolgd door vr2 | links in `index.html:421` en `dagstart.html:249` naar vr2 zetten, dan verwijderen |
| `bwf-reservering-extra.js` | nergens geladen | vragen / verwijderen |
| `bwf-incheck-main-test.zip` (3,1 MB) | kopie van de repo van 09-09 | verwijderen |
| `files (5).zip` (2,1 MB) | oude `dashboard.html` + 6 afbeeldingen (menukaarten en arrangementen Lelystad/Almere) | afbeeldingen eerst veiligstellen als ze nergens anders staan, dan verwijderen |
| map `~` | oudere kopie van `planyo-bridge` | verwijderen |
| `supabase/.temp/` | lokale CLI-status in git | uit git halen, in `.gitignore` |

**Supabase — pas beslissen in fase 1, na export:**
- **Zonder rijen en zonder gebruik:** `welkomstcalls` (+ view `urenregistratie_welkomstcalls`), `uren_registraties`, `personeel_diensten`, `vakantie_aanvragen`, `mollie_koppeling`.
- **Met rijen, maar door geen pagina gebruikt:** `bwf_gebruikers` (9), `backup_*` (4 tabellen).
- **Samenvoegen:** de vijf personeelstabellen (1.5).

---

## Bijlage A — kolommen per tabel (live, 11-09-2026)

#### `backup_res_koppeling_20260910`
72 rijen · RLS aan · PK: –
Policies: **geen** (via de API niet leesbaar/schrijfbaar)

| kolom | type | null | default |
|---|---|---|---|
| res_sleutel | text | ja |  |
| bron | text | ja |  |
| klant_id | text | ja |  |
| checkin_id | text | ja |  |
| member | boolean | ja |  |
| welkomstcall_id | text | ja |  |
| gastenregister_id | text | ja |  |
| totaal | numeric | ja |  |
| betaald | numeric | ja |  |
| betaalwijze | text | ja |  |
| notitie | text | ja |  |
| bijgewerkt | timestamp with time zone | ja |  |
| medewerker | text | ja |  |
| gast | text | ja |  |
| telefoon | text | ja |  |
| email | text | ja |  |
| personen | text | ja |  |
| arrangement | text | ja |  |
| review_taak_id | text | ja |  |
| review_verstuurd | date | ja |  |
| aankomst | date | ja |  |
| vertrek | date | ja |  |
| tijd_in | text | ja |  |
| tijd_uit | text | ja |  |
| geannuleerd | date | ja |  |
| borg_bedrag | numeric | ja |  |
| borg_wijze | text | ja |  |
| borg_ontvangen | date | ja |  |
| borg_terug | numeric | ja |  |
| borg_ingehouden | numeric | ja |  |
| borg_afgehandeld | date | ja |  |
| borg_notitie | text | ja |  |
| wc_extra_bedrag | numeric | ja |  |
| wc_betaalwijze | text | ja |  |
| wc_bijzonderheden | text | ja |  |
| wc_status | text | ja |  |

#### `backup_reservations_20260910`
49 rijen · RLS aan · PK: –
Policies: **geen** (via de API niet leesbaar/schrijfbaar)

| kolom | type | null | default |
|---|---|---|---|
| id | text | ja |  |
| locatie | text | ja |  |
| voornaam | text | ja |  |
| achternaam | text | ja |  |
| checkindatum | date | ja |  |
| checkuitdatum | date | ja |  |
| checkintijd | text | ja |  |
| checkuittijd | text | ja |  |
| arrangement | text | ja |  |
| totaal | numeric | ja |  |
| betaald | numeric | ja |  |
| toegewezen | text | ja |  |
| opmerkingen | text | ja |  |
| created_at | timestamp with time zone | ja |  |
| updated_at | timestamp with time zone | ja |  |
| telefoon | text | ja |  |
| email | text | ja |  |
| status | integer | ja |  |
| klant_id | text | ja |  |

#### `backup_taken_20260909`
50 rijen · RLS aan · PK: –
Policies: **geen** (via de API niet leesbaar/schrijfbaar)

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | ja |  |
| titel | text | ja |  |
| omschrijving | text | ja |  |
| medewerker_id | uuid | ja |  |
| deadline | date | ja |  |
| prioriteit | text | ja |  |
| status | text | ja |  |
| link | text | ja |  |
| bron | text | ja |  |
| van | text | ja |  |
| email_datum | text | ja |  |
| afgerond_op | timestamp with time zone | ja |  |
| aangemaakt | timestamp with time zone | ja |  |
| aangemaakt_door | uuid | ja |  |
| call_id | text | ja |  |

#### `backup_welkomstcalls_20260909`
45 rijen · RLS aan · PK: –
Policies: **geen** (via de API niet leesbaar/schrijfbaar)

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | ja |  |
| klant_id | text | ja |  |
| naam | text | ja |  |
| telefoon | text | ja |  |
| email | text | ja |  |
| locatie | text | ja |  |
| datum | date | ja |  |
| tijd | text | ja |  |
| personen | integer | ja |  |
| referentie | text | ja |  |
| gelegenheid | text | ja |  |
| regels | jsonb | ja |  |
| totaal | numeric | ja |  |
| betaallink | text | ja |  |
| incheck_link | text | ja |  |
| status | text | ja |  |
| notitie | text | ja |  |
| gebeld_op | timestamp with time zone | ja |  |
| medewerker_id | text | ja |  |
| aangemaakt | timestamp with time zone | ja |  |
| bijlage_url | text | ja |  |
| bijlage_naam | text | ja |  |
| kanaal | text | ja |  |
| voornaam | text | ja |  |
| achternaam | text | ja |  |
| woonplaats | text | ja |  |
| member | boolean | ja |  |
| herhaalbezoek | boolean | ja |  |
| verblijftype | text | ja |  |
| datum_eind | date | ja |  |
| tijd_eind | text | ja |  |
| arrangementen | text | ja |  |
| bron | text | ja |  |
| betaalwijze | text | ja |  |
| smg_tekst | text | ja |  |
| smg_extra | text | ja |  |
| smg_betaald | boolean | ja |  |
| smg_bedrag | numeric | ja |  |
| deadline | date | ja |  |
| automatisch | boolean | ja |  |
| bijzonderheden | text | ja |  |
| allergieen | text | ja |  |
| tijd_verzoek | text | ja |  |
| tijd_bedrag | numeric | ja |  |

#### `bwf_betalingen`
2 rijen · RLS aan · PK: id · uniek: mollie_payment_id
Policies: SELECT {authenticated} using `true`

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | nee | gen_random_uuid() |
| reservering_id | text | nee |  |
| klant_id | text | ja |  |
| mollie_payment_id | text | nee |  |
| factuurnummer | text | ja |  |
| omschrijving | text | ja |  |
| bedrag | numeric | nee |  |
| valuta | text | nee | 'EUR'::text |
| status | text | nee | 'open'::text |
| checkout_url | text | ja |  |
| betaald_op | timestamp with time zone | ja |  |
| aangemaakt | timestamp with time zone | nee | now() |
| bijgewerkt | timestamp with time zone | nee | now() |

#### `bwf_gastlinks`
2 rijen · RLS aan · PK: id · uniek: reservering_id; token_hash
Policies: **geen** (via de API niet leesbaar/schrijfbaar)

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | nee | gen_random_uuid() |
| token_hash | text | nee |  |
| reservering_id | text | nee |  |
| klant_id | text | ja |  |
| voornaam | text | ja |  |
| achternaam | text | ja |  |
| email | text | ja |  |
| telefoon | text | ja |  |
| locatie | text | ja |  |
| aankomst | date | ja |  |
| vertrek | date | ja |  |
| vervalt_op | timestamp with time zone | nee |  |
| geopend_op | timestamp with time zone | ja |  |
| aangemaakt | timestamp with time zone | nee | now() |
| bijgewerkt | timestamp with time zone | nee | now() |

#### `bwf_gebruikers`
9 rijen · RLS aan · PK: email
Policies: SELECT {public} using `(auth.role() = 'authenticated'::text)`

| kolom | type | null | default |
|---|---|---|---|
| email | text | nee |  |
| naam | text | ja |  |
| rol | text | nee |  |
| actief | boolean | ja | true |
| aangemaakt | timestamp with time zone | ja | now() |

#### `bwf_producten`
35 rijen · RLS aan · PK: id · uniek: categorie,naam
Policies: SELECT {authenticated} using `true`

| kolom | type | null | default |
|---|---|---|---|
| id | bigint | nee |  |
| categorie | text | nee |  |
| naam | text | nee |  |
| prijs | numeric | nee |  |
| per_persoon | boolean | nee | false |
| sortering | integer | nee | 100 |
| actief | boolean | nee | true |

#### `bwf_rollen`
5 rijen · RLS aan · PK: id · FK: id → None
Policies: SELECT {public} using `((id = auth.uid()) OR is_beheerder())`

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | nee |  |
| naam | text | nee |  |
| rol | text | nee | 'medewerker'::text |

#### `bwf_tariefblokken`
32 rijen · RLS aan · PK: id · uniek: dagtype,eindtijd,naam,starttijd,suite,verblijf
Policies: SELECT {authenticated} using `true`

| kolom | type | null | default |
|---|---|---|---|
| id | bigint | nee |  |
| suite | text | nee |  |
| verblijf | text | nee |  |
| dagtype | text | nee | 'alle'::text |
| naam | text | nee | ''::text |
| starttijd | time without time zone | nee |  |
| eindtijd | time without time zone | nee |  |
| prijs | numeric | nee |  |
| sortering | integer | nee | 100 |
| actief | boolean | nee | true |

#### `checkins`
88 rijen · RLS aan · PK: id
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | text | nee |  |
| locatie | text | nee |  |
| manager | text | ja |  |
| datum | date | ja |  |
| resnr | text | ja |  |
| personen | text | ja |  |
| incheck | text | ja |  |
| uitcheck | text | ja |  |
| arrangementen | jsonb | ja | '[]'::jsonb |
| totaal | text | ja |  |
| aanbetaald | text | ja |  |
| restant | text | ja |  |
| betaalwijze | text | ja |  |
| deelbetaling | text | ja |  |
| opmerkingen_betaling | text | ja |  |
| opmerkingen | text | ja |  |
| voornaam | text | ja |  |
| achternaam | text | ja |  |
| nationaliteit | text | ja |  |
| geboortedatum | date | ja |  |
| woonplaats | text | ja |  |
| telefoon | text | ja |  |
| email | text | ja |  |
| lid | boolean | ja | false |
| akkoord | boolean | ja | false |
| handtekening | text | ja |  |
| created_at | timestamp with time zone | ja | now() |
| akkoord_voorwaarden | boolean | ja | false |
| reservation_id | text | ja |  |
| boeking_via | text | ja |  |
| verblijftype | text | ja |  |
| bestellingen | jsonb | ja |  |
| cadeau | text | ja |  |
| cadeau_prijs | numeric | ja |  |
| service_items | jsonb | ja |  |
| checkout_extra_type | text | ja |  |
| checkout_extra_duur | text | ja |  |
| checkout_extra_prijs | numeric | ja |  |
| checkout_extra_betaalwijze | text | ja |  |
| extra_omzet | numeric | ja |  |
| checkuitdatum | date | ja |  |
| aantal_kinderen | integer | ja |  |
| vooraf_gereserveerd | jsonb | ja |  |
| split_betaling | boolean | ja | false |
| split_bedrag1 | numeric | ja |  |
| split_wijze1 | text | ja |  |
| split_bedrag2 | numeric | ja |  |
| split_wijze2 | text | ja |  |
| reservering_bedrag | numeric | ja | 0 |
| extras_totaal | numeric | ja | 0 |
| extras_betaalwijze | text | ja |  |
| status | text | ja | 'definitief'::text |
| betalingen | jsonb | ja | '[]'::jsonb |
| cadeau_code | text | ja |  |
| gekoppelde_reservering | text | ja |  |

#### `documenten`
36 rijen · RLS aan · PK: id
Policies: SELECT {anon} using `true`; ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | text | nee |  |
| type | text | ja |  |
| locatie | text | ja |  |
| bestandsnaam | text | ja |  |
| data | text | ja |  |
| updated_at | timestamp with time zone | ja | now() |
| mimetype | text | ja |  |

#### `facturen`
0 rijen · RLS aan · PK: id · uniek: factuurnummer
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | bigint | nee | nextval('facturen_id_seq'::regclass) |
| factuurnummer | text | nee |  |
| jaar | integer | nee |  |
| volgnummer | integer | nee |  |
| checkin_id | text | ja |  |
| reservering_ref | text | ja |  |
| klant_id | text | ja |  |
| bedrijfsnaam | text | ja |  |
| adres | text | ja |  |
| postcode | text | ja |  |
| plaats | text | ja |  |
| land | text | ja | 'Nederland'::text |
| omschrijving | text | ja |  |
| bedrag | numeric | ja |  |
| btw | numeric | ja |  |
| datum | date | ja | CURRENT_DATE |
| verzonden_op | timestamp with time zone | ja |  |
| aangemaakt | timestamp with time zone | ja | now() |
| aangemaakt_door | uuid | ja |  |

#### `gast_aanmeldingen`
7 rijen · RLS aan · PK: id
Policies: SELECT {authenticated} using `true`; INSERT {anon} using `–` check `true`; UPDATE {authenticated} using `true` check `true`; SELECT {authenticated} using `true`; DELETE {authenticated} using `true`

| kolom | type | null | default |
|---|---|---|---|
| id | text | nee |  |
| created_at | timestamp with time zone | ja | now() |
| code | text | ja |  |
| locatie | text | ja |  |
| datum | date | ja |  |
| voornaam | text | ja |  |
| achternaam | text | ja |  |
| woonplaats | text | ja |  |
| nationaliteit | text | ja |  |
| telefoon | text | ja |  |
| email | text | ja |  |
| lid | boolean | ja | false |
| akkoord | boolean | ja | false |
| akkoord_voorwaarden | boolean | ja | false |
| handtekening | text | ja |  |
| status | text | ja | 'nieuw'::text |
| checkin_id | text | ja |  |

#### `instellingen`
9 rijen · RLS aan · PK: sleutel
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| sleutel | text | nee |  |
| waarde | text | ja |  |

#### `medewerkers`
6 rijen · RLS aan · PK: id
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | text | nee |  |
| naam | text | nee |  |
| rol | text | ja |  |
| locatie | text | ja |  |
| aangemaakt | timestamp with time zone | nee | now() |
| email | text | ja |  |

#### `mollie_betalingen`
0 rijen · RLS aan · PK: id · uniek: mollie_id
Policies: SELECT {authenticated} using `true`

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | nee | gen_random_uuid() |
| mollie_id | text | nee |  |
| status | text | nee | 'open'::text |
| mode | text | nee | 'test'::text |
| bedrag | numeric | nee | 0 |
| valuta | text | nee | 'EUR'::text |
| omschrijving | text | ja |  |
| reservering | text | ja |  |
| gast | text | ja |  |
| checkout_url | text | ja |  |
| betaald_op | timestamp with time zone | ja |  |
| verlopen_op | timestamp with time zone | ja |  |
| mollie_aangemaakt_op | timestamp with time zone | ja |  |
| bijgewerkt_op | timestamp with time zone | nee | now() |
| aangemaakt_op | timestamp with time zone | nee | now() |

#### `mollie_koppeling`
0 rijen · RLS aan · PK: payment_id
Policies: SELECT {authenticated} using `true`; INSERT {authenticated} using `–` check `true`; DELETE {authenticated} using `true`; UPDATE {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| payment_id | text | nee |  |
| res_sleutel | text | ja |  |
| referentie | text | ja |  |
| gast | text | ja |  |
| locatie | text | ja |  |
| aankomst | date | ja |  |
| bedrag | numeric | ja |  |
| status | text | ja |  |
| omschrijving | text | ja |  |
| gekoppeld_door | text | ja |  |
| bijgewerkt | timestamp with time zone | nee | now() |

#### `overdracht`
1 rijen · RLS aan · PK: id
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | text | nee |  |
| ts | bigint | nee |  |
| auteur | text | ja |  |
| aan | text | ja |  |
| locatie | text | ja |  |
| cat | text | ja |  |
| tekst | text | ja |  |
| klaar | boolean | nee | false |
| aangemaakt | timestamp with time zone | nee | now() |
| datum | date | ja |  |

#### `personeel_diensten`
0 rijen · RLS aan · PK: id · FK: staff_id → staff
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | text | nee |  |
| staff_id | text | ja |  |
| locatie | text | ja |  |
| datum | date | ja |  |
| dienst | text | ja |  |
| opmerking | text | ja |  |
| created_at | timestamp with time zone | ja | now() |

#### `planning`
38 rijen · RLS aan · PK: id
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | text | nee |  |
| datum | date | nee |  |
| medewerker_id | text | ja |  |
| locatie | text | ja |  |
| dienst | text | ja |  |
| notitie | text | ja |  |
| aangemaakt | timestamp with time zone | nee | now() |

#### `psm_administratie`
215 rijen · RLS aan · PK: id
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | nee | gen_random_uuid() |
| medewerker | text | nee |  |
| soort | text | nee | 'boeking'::text |
| datum | date | nee |  |
| locatie | text | ja |  |
| boeking_nr | text | ja |  |
| tijd_van | text | ja |  |
| tijd_tot | text | ja |  |
| arrangement | text | ja |  |
| bedrag | numeric | ja |  |
| bank_op_locatie | numeric | ja |  |
| cash_op_locatie | numeric | ja |  |
| vergoeding | numeric | ja |  |
| factuur_nr | text | ja |  |
| btw | numeric | ja |  |
| wijze | text | ja |  |
| voldaan | boolean | ja | false |
| km | numeric | ja |  |
| data | jsonb | ja |  |
| opmerking | text | ja |  |
| created_at | timestamp with time zone | ja | now() |

#### `res_koppeling`
74 rijen · RLS aan · PK: res_sleutel
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| res_sleutel | text | nee |  |
| bron | text | ja |  |
| klant_id | text | ja |  |
| checkin_id | text | ja |  |
| member | boolean | ja | false |
| welkomstcall_id | text | ja |  |
| gastenregister_id | text | ja |  |
| totaal | numeric | ja |  |
| betaald | numeric | ja |  |
| betaalwijze | text | ja |  |
| notitie | text | ja |  |
| bijgewerkt | timestamp with time zone | ja | now() |
| medewerker | text | ja |  |
| gast | text | ja |  |
| telefoon | text | ja |  |
| email | text | ja |  |
| personen | text | ja |  |
| arrangement | text | ja |  |
| review_taak_id | text | ja |  |
| review_verstuurd | date | ja |  |
| aankomst | date | ja |  |
| vertrek | date | ja |  |
| tijd_in | text | ja |  |
| tijd_uit | text | ja |  |
| geannuleerd | date | ja |  |
| borg_bedrag | numeric | ja | 0 |
| borg_wijze | text | ja |  |
| borg_ontvangen | date | ja |  |
| borg_terug | numeric | ja | 0 |
| borg_ingehouden | numeric | ja | 0 |
| borg_afgehandeld | date | ja |  |
| borg_notitie | text | ja |  |
| wc_extra_bedrag | numeric | ja | 0 |
| wc_betaalwijze | text | ja |  |
| wc_bijzonderheden | text | ja |  |
| wc_status | text | ja |  |
| welkomstcall_gedaan | date | ja |  |

#### `reservations`
36 rijen · RLS aan · PK: id · FK: klant_id → wz_klantbeheer
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | text | nee |  |
| locatie | text | nee |  |
| voornaam | text | ja |  |
| achternaam | text | ja |  |
| checkindatum | date | ja |  |
| checkuitdatum | date | ja |  |
| checkintijd | text | ja |  |
| checkuittijd | text | ja |  |
| arrangement | text | ja |  |
| totaal | numeric | ja | 0 |
| betaald | numeric | ja | 0 |
| toegewezen | text | ja |  |
| opmerkingen | text | ja |  |
| created_at | timestamp with time zone | ja | now() |
| updated_at | timestamp with time zone | ja | now() |
| telefoon | text | ja |  |
| email | text | ja |  |
| status | integer | ja |  |
| klant_id | text | ja |  |

#### `schade`
0 rijen · RLS aan · PK: id
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | text | nee |  |
| aangemaakt | timestamp with time zone | ja | now() |
| res_sleutel | text | ja |  |
| klant_id | text | ja |  |
| gast | text | ja |  |
| email | text | ja |  |
| telefoon | text | ja |  |
| locatie | text | ja |  |
| datum | date | ja |  |
| verzekeringsnummer | text | ja |  |
| oorzaak | text | ja |  |
| omschrijving | text | ja |  |
| bedrag | numeric | ja | 0 |
| voldaan | text | ja |  |
| status | text | ja | 'open'::text |
| notitie | text | ja |  |

#### `staff`
6 rijen · RLS aan · PK: id
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | text | nee |  |
| naam | text | nee |  |
| created_at | timestamp with time zone | ja | now() |
| locatie | text | ja |  |
| rol | text | ja | 'medewerker'::text |

#### `uren_registratie`
34 rijen · RLS aan · PK: id
Policies: SELECT {authenticated} using `true`; INSERT {authenticated} using `–` check `true`; DELETE {authenticated} using `true`; UPDATE {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | nee | gen_random_uuid() |
| medewerker | text | nee | 'Ruth Tilburg'::text |
| datum | date | nee |  |
| soort | text | nee |  |
| menu | boolean | nee | false |
| arrangement | boolean | nee | false |
| laat_inchecken | boolean | nee | false |
| suite | text | ja |  |
| bron | text | ja |  |
| opmerking | text | ja |  |
| uren | numeric | nee |  |
| uurtarief | numeric | nee | 16.50 |
| bedrag | numeric | nee |  |
| aangemaakt_op | timestamp with time zone | nee | now() |
| verblijf | text | nee | 'dagverblijf'::text |

#### `uren_registraties`
0 rijen · RLS aan · PK: id · FK: staff_id → staff
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | text | nee |  |
| staff_id | text | ja |  |
| locatie | text | ja |  |
| datum | date | ja |  |
| dagverblijf_uren | numeric | ja | 0 |
| avondverblijf_uren | numeric | ja | 0 |
| opmerking | text | ja |  |
| created_at | timestamp with time zone | ja | now() |

#### `urenregistratie_welkomstcalls` (view)

| kolom | type | null | default |
|---|---|---|---|
| medewerker | text | ja |  |
| maand | date | ja |  |
| calls_afgerond | bigint | ja |  |
| geen_gehoor | bigint | ja |  |
| terugbellen | bigint | ja |  |
| bijboekingen | bigint | ja |  |
| extra_omzet | numeric | ja |  |
| te_betalen | numeric | ja |  |

#### `v_welkomstcalls_open` (view)

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | ja |  |
| klant_id | text | ja |  |
| naam | text | ja |  |
| telefoon | text | ja |  |
| email | text | ja |  |
| locatie | text | ja |  |
| datum | date | ja |  |
| tijd | text | ja |  |
| personen | integer | ja |  |
| referentie | text | ja |  |
| gelegenheid | text | ja |  |
| regels | jsonb | ja |  |
| totaal | numeric | ja |  |
| betaallink | text | ja |  |
| incheck_link | text | ja |  |
| status | text | ja |  |
| notitie | text | ja |  |
| gebeld_op | timestamp with time zone | ja |  |
| medewerker_id | text | ja |  |
| aangemaakt | timestamp with time zone | ja |  |
| bijlage_url | text | ja |  |
| bijlage_naam | text | ja |  |
| kanaal | text | ja |  |
| voornaam | text | ja |  |
| achternaam | text | ja |  |
| woonplaats | text | ja |  |
| member | boolean | ja |  |
| herhaalbezoek | boolean | ja |  |
| verblijftype | text | ja |  |
| datum_eind | date | ja |  |
| tijd_eind | text | ja |  |
| arrangementen | text | ja |  |
| bron | text | ja |  |
| betaalwijze | text | ja |  |
| smg_tekst | text | ja |  |
| smg_extra | text | ja |  |
| smg_betaald | boolean | ja |  |
| smg_bedrag | numeric | ja |  |
| deadline | date | ja |  |
| automatisch | boolean | ja |  |
| bijzonderheden | text | ja |  |
| allergieen | text | ja |  |
| tijd_verzoek | text | ja |  |
| tijd_bedrag | numeric | ja |  |
| nodig | boolean | ja |  |
| gepland_op | timestamp with time zone | ja |  |
| terugbel_op | timestamp with time zone | ja |  |
| afgerond_op | timestamp with time zone | ja |  |
| notities | text | ja |  |
| res_sleutel | text | ja |  |
| bijgewerkt | timestamp with time zone | ja |  |
| koppel_klant_id | text | ja |  |

#### `vakantie_aanvragen`
0 rijen · RLS aan · PK: id · FK: staff_id → staff
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | text | nee |  |
| staff_id | text | ja |  |
| locatie | text | ja |  |
| van_datum | date | ja |  |
| tot_datum | date | ja |  |
| opmerking | text | ja |  |
| status | text | ja | 'aangevraagd'::text |
| created_at | timestamp with time zone | ja | now() |

#### `voorraad`
88 rijen · RLS aan · PK: id
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | text | nee |  |
| naam | text | nee |  |
| categorie | text | ja |  |
| aantal | integer | nee | 0 |
| min_aantal | integer | nee | 0 |
| leverancier | text | ja |  |
| besteld | boolean | nee | false |
| bestel_aantal | integer | nee | 0 |
| aangemaakt | timestamp with time zone | nee | now() |
| verwacht | date | ja |  |

#### `welkomstcalls`
0 rijen · RLS aan · PK: id · FK: medewerker → None
Policies: DELETE {public} using `is_beheerder()`; UPDATE {public} using `((medewerker = auth.uid()) OR is_beheerder())`; INSERT {public} using `–` check `(medewerker = auth.uid())`; SELECT {public} using `((medewerker = auth.uid()) OR is_beheerder())`

| kolom | type | null | default |
|---|---|---|---|
| id | bigint | nee |  |
| aangemaakt | timestamp with time zone | nee | now() |
| medewerker | uuid | nee | auth.uid() |
| reserveringsnummer | text | ja |  |
| gast | text | ja |  |
| telefoon | text | ja |  |
| suite | text | ja |  |
| aankomst | date | ja |  |
| bron | text | ja |  |
| uitkomst | text | nee |  |
| pogingen | integer | ja | 1 |
| arrangementen | integer | ja | 0 |
| eten | integer | ja | 0 |
| wijn | integer | ja | 0 |
| vip | integer | ja | 0 |
| bedrag_bijboeking | numeric | ja |  |
| betaalstatus | text | ja |  |
| betaald | boolean | ja | false |
| vergoeding | numeric | nee | 0 |
| notitie | text | ja |  |

#### `wz_bel_items`
0 rijen · RLS aan · PK: id · FK: lijst_id → wz_bellijsten
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | nee | gen_random_uuid() |
| lijst_id | uuid | nee |  |
| naam | text | ja |  |
| telefoon | text | ja |  |
| email | text | ja |  |
| referentie | text | ja |  |
| extra | text | ja |  |
| notitie | text | ja |  |
| status | text | nee | 'te bellen'::text |
| gebeld_op | timestamp with time zone | ja |  |
| volgorde | integer | ja | 0 |
| aangemaakt | timestamp with time zone | nee | now() |

#### `wz_belastingtarief`
3 rijen · RLS aan · PK: id
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | nee | gen_random_uuid() |
| locatie | text | nee |  |
| gemeente | text | ja |  |
| methode | text | nee | 'per_persoon'::text |
| tarief | numeric | nee | 0 |
| kind_vrij_tm | integer | nee | 0 |
| opmerking | text | ja |  |
| aangemaakt | timestamp with time zone | nee | now() |

#### `wz_bellijsten`
0 rijen · RLS aan · PK: id · FK: medewerker_id → wz_medewerkers
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | nee | gen_random_uuid() |
| naam | text | nee |  |
| bron | text | ja |  |
| medewerker_id | uuid | ja |  |
| aangemaakt | timestamp with time zone | nee | now() |

#### `wz_belscript_stappen`
18 rijen · RLS aan · PK: id · FK: script_id → wz_belscripts
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | nee | gen_random_uuid() |
| script_id | uuid | nee |  |
| soort | text | nee | 'stap'::text |
| tekst | text | nee |  |
| volgorde | integer | nee | 0 |
| aangemaakt | timestamp with time zone | nee | now() |

#### `wz_belscripts`
1 rijen · RLS aan · PK: id
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | nee | gen_random_uuid() |
| titel | text | nee |  |
| omschrijving | text | ja |  |
| actief | boolean | nee | true |
| sortering | integer | nee | 100 |
| aangemaakt | timestamp with time zone | nee | now() |

#### `wz_documenten`
4 rijen · RLS aan · PK: id · FK: medewerker_id → wz_medewerkers; taak_id → wz_taken
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | nee | gen_random_uuid() |
| titel | text | nee |  |
| categorie | text | ja | 'Algemeen'::text |
| url | text | nee |  |
| bestandsnaam | text | ja |  |
| opmerking | text | ja |  |
| taak_id | uuid | ja |  |
| medewerker_id | uuid | ja |  |
| aangemaakt | timestamp with time zone | nee | now() |

#### `wz_extras`
19 rijen · RLS aan · PK: id
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | nee | gen_random_uuid() |
| naam | text | nee |  |
| categorie | text | nee | 'Arrangement'::text |
| prijs | numeric | nee | 0 |
| per_persoon | boolean | nee | false |
| omschrijving | text | ja |  |
| actief | boolean | nee | true |
| sortering | integer | nee | 100 |
| aangemaakt | timestamp with time zone | nee | now() |

#### `wz_gastenregister`
0 rijen · RLS aan · PK: id · FK: ingevoerd_door → wz_medewerkers
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | nee | gen_random_uuid() |
| locatie | text | nee |  |
| gemeente | text | ja |  |
| aankomst | date | nee |  |
| vertrek | date | nee |  |
| nachten | integer | nee | 0 |
| volwassenen | integer | nee | 0 |
| kinderen | integer | nee | 0 |
| overnachtingen | integer | nee | 0 |
| omzet | numeric | nee | 0 |
| vrijgesteld | boolean | nee | false |
| belasting | numeric | nee | 0 |
| naam | text | ja |  |
| woonplaats | text | ja |  |
| referentie | text | ja |  |
| bron | text | ja |  |
| notitie | text | ja |  |
| ingevoerd_door | uuid | ja |  |
| aangemaakt | timestamp with time zone | nee | now() |
| reservering_ref | text | ja |  |

#### `wz_gesprekken`
0 rijen · RLS aan · PK: id
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | nee | gen_random_uuid() |
| medewerker_id | uuid | ja |  |
| soort | text | ja |  |
| status | text | ja |  |
| naam | text | ja |  |
| telefoon | text | ja |  |
| locatie | text | ja |  |
| notitie | text | ja |  |
| aangemaakt | timestamp with time zone | ja | now() |

#### `wz_klantbeheer`
16 rijen · RLS aan · PK: id · FK: aangemaakt_door → wz_medewerkers
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | text | nee |  |
| type | text | nee | 'overnachting'::text |
| locatie_id | text | ja |  |
| datum_in | date | ja |  |
| datum_uit | date | ja |  |
| nachten | integer | ja | 0 |
| contact_datum | date | ja |  |
| voorletters | text | ja | ''::text |
| achternaam | text | ja | ''::text |
| geboortedatum | date | ja |  |
| woonplaats | text | ja | ''::text |
| email | text | ja | ''::text |
| telefoon | text | ja | ''::text |
| nationaliteit | text | ja | ''::text |
| personen | integer | ja | 0 |
| kinderen | integer | ja | 0 |
| kale_prijs | numeric | ja | 0 |
| totaal_betaald | numeric | ja | 0 |
| member | boolean | ja | false |
| bron | text | ja | ''::text |
| notitie | text | ja | ''::text |
| aangemaakt | timestamp with time zone | ja | now() |
| voornaam | text | ja |  |
| adres | text | ja |  |
| postcode | text | ja |  |
| land | text | ja | 'Nederland'::text |
| referentie | text | ja |  |
| voorkeuren | text | ja |  |
| allergieen | text | ja |  |
| laatste_bezoek | date | ja |  |
| aangemaakt_door | uuid | ja |  |
| planyo_user_id | text | ja |  |

#### `wz_klantbeheer_instellingen`
0 rijen · RLS aan · PK: id
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | text | nee |  |
| data | jsonb | nee | '{}'::jsonb |
| bijgewerkt | timestamp with time zone | ja | now() |

#### `wz_links`
16 rijen · RLS aan · PK: id
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | nee | gen_random_uuid() |
| tab | text | nee |  |
| titel | text | nee |  |
| url | text | nee |  |
| kleur | text | ja |  |
| omschrijving | text | ja |  |
| sortering | integer | nee | 100 |
| aangemaakt | timestamp with time zone | nee | now() |

#### `wz_medewerkers`
8 rijen · RLS aan · PK: id
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | nee | gen_random_uuid() |
| naam | text | nee |  |
| rol | text | nee | 'medewerker'::text |
| code | text | ja |  |
| kleur | text | ja | '#9A7B4F'::text |
| uurtarief | numeric | ja |  |
| gastenregister | boolean | nee | false |
| actief | boolean | nee | true |
| aangemaakt | timestamp with time zone | nee | now() |
| email | text | ja |  |
| auth_id | uuid | ja |  |

#### `wz_overdracht`
0 rijen · RLS aan · PK: id · FK: aan_id → wz_medewerkers; afgehandeld_door → wz_medewerkers; van_id → wz_medewerkers
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | nee | gen_random_uuid() |
| van_id | uuid | ja |  |
| aan_id | uuid | ja |  |
| locatie | text | ja | 'Algemeen'::text |
| soort | text | nee | 'info'::text |
| tekst | text | nee |  |
| afgehandeld | boolean | nee | false |
| afgehandeld_op | timestamp with time zone | ja |  |
| afgehandeld_door | uuid | ja |  |
| aangemaakt | timestamp with time zone | nee | now() |

#### `wz_reservering_klanten`
8 rijen · RLS aan · PK: id · uniek: bron,reservering_id · FK: klant_id → wz_klantbeheer
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | nee | gen_random_uuid() |
| bron | text | nee |  |
| reservering_id | text | nee |  |
| klant_id | text | nee |  |
| planyo_user_id | text | ja |  |
| aangemaakt | timestamp with time zone | nee | now() |
| bijgewerkt | timestamp with time zone | nee | now() |

#### `wz_taken`
54 rijen · RLS aan · PK: id · FK: aangemaakt_door → wz_medewerkers; medewerker_id → wz_medewerkers
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | nee | gen_random_uuid() |
| titel | text | nee |  |
| omschrijving | text | ja |  |
| medewerker_id | uuid | ja |  |
| deadline | date | ja |  |
| prioriteit | text | nee | 'normaal'::text |
| status | text | nee | 'open'::text |
| link | text | ja |  |
| bron | text | nee | 'handmatig'::text |
| van | text | ja |  |
| email_datum | text | ja |  |
| afgerond_op | timestamp with time zone | ja |  |
| aangemaakt | timestamp with time zone | nee | now() |
| aangemaakt_door | uuid | ja |  |
| call_id | text | ja |  |

#### `wz_tarieven`
9 rijen · RLS aan · PK: id
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | nee | gen_random_uuid() |
| taak | text | nee |  |
| omschrijving | text | ja |  |
| soort | text | nee | 'stuk'::text |
| eenheid | text | nee | 'stuk'::text |
| uren | numeric | nee | 0 |
| tarief | numeric | nee | 0 |
| categorie | text | ja |  |
| actief | boolean | nee | true |
| sortering | integer | nee | 100 |
| aangemaakt | timestamp with time zone | nee | now() |

#### `wz_welkomstcalls`
49 rijen · RLS aan · PK: id
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | nee | gen_random_uuid() |
| klant_id | text | ja |  |
| naam | text | ja |  |
| telefoon | text | ja |  |
| email | text | ja |  |
| locatie | text | ja |  |
| datum | date | ja |  |
| tijd | text | ja |  |
| personen | integer | ja | 2 |
| referentie | text | ja |  |
| gelegenheid | text | ja |  |
| regels | jsonb | ja | '[]'::jsonb |
| totaal | numeric | ja | 0 |
| betaallink | text | ja |  |
| incheck_link | text | ja |  |
| status | text | ja | 'te bellen'::text |
| notitie | text | ja |  |
| gebeld_op | timestamp with time zone | ja |  |
| medewerker_id | text | ja |  |
| aangemaakt | timestamp with time zone | nee | now() |
| bijlage_url | text | ja |  |
| bijlage_naam | text | ja |  |
| kanaal | text | ja | 'whatsapp'::text |
| voornaam | text | ja |  |
| achternaam | text | ja |  |
| woonplaats | text | ja |  |
| member | boolean | ja | false |
| herhaalbezoek | boolean | ja | false |
| verblijftype | text | ja |  |
| datum_eind | date | ja |  |
| tijd_eind | text | ja |  |
| arrangementen | text | ja |  |
| bron | text | ja |  |
| betaalwijze | text | ja | 'mollie'::text |
| smg_tekst | text | ja |  |
| smg_extra | text | ja |  |
| smg_betaald | boolean | ja |  |
| smg_bedrag | numeric | ja |  |
| deadline | date | ja |  |
| automatisch | boolean | ja | false |
| bijzonderheden | text | ja |  |
| allergieen | text | ja |  |
| tijd_verzoek | text | ja |  |
| tijd_bedrag | numeric | ja |  |
| nodig | boolean | nee | true |
| gepland_op | timestamp with time zone | ja |  |
| terugbel_op | timestamp with time zone | ja |  |
| afgerond_op | timestamp with time zone | ja |  |
| notities | text | ja |  |
| res_sleutel | text | ja |  |
| bijgewerkt | timestamp with time zone | nee | now() |

#### `wz_werkzaamheden`
0 rijen · RLS aan · PK: id · FK: medewerker_id → wz_medewerkers; tarief_id → wz_tarieven
Policies: ALL {authenticated} using `true` check `true`

| kolom | type | null | default |
|---|---|---|---|
| id | uuid | nee | gen_random_uuid() |
| datum | date | nee | CURRENT_DATE |
| medewerker_id | uuid | ja |  |
| tarief_id | uuid | ja |  |
| taak_naam | text | nee |  |
| eenheid | text | ja |  |
| aantal | numeric | nee | 1 |
| uren | numeric | nee | 0 |
| tarief | numeric | nee | 0 |
| bedrag | numeric | nee | 0 |
| notitie | text | ja |  |
| betaald | boolean | nee | false |
| aangemaakt | timestamp with time zone | nee | now() |
