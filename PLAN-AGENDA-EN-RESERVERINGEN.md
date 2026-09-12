# PLAN — Eén agenda, reserveringen per kanaal en rollen
Bed & Wellness Flevoland · repo `bwf-incheck` · Supabase project `iuyjvtlauktnjprbmbjj`
Opgesteld 11-09-2026. Dit bestand is de opdracht voor Claude Code op de MacBook (`~/bwf-incheck`).

---

## 0. Spelregels voor Claude Code

1. **Eerst lezen, dan bouwen.** Begin elke sessie met `git pull` en lees dit plan plus `README.md` en `LEESMIJ-wijzigingen.md`.
2. **Niets weggooien zonder export.** Vóór elke `drop`/`truncate`/`delete` op Supabase eerst een export naar `exports/YYYY-MM-DD/<tabel>.csv` (via `supabase db dump` of `psql \copy`). Exports worden **niet** gecommit (`exports/` in `.gitignore`).
3. **Geen geheimen in de repo.** Service-role key, Google-agendasleutel en ICS-URL's staan alleen in Supabase (Edge Function-secrets, Vault of de tabel `kanaal_instellingen` die alleen de eigenaar kan lezen) of in een lokale `.env` die in `.gitignore` staat. In HTML/JS alleen de publieke anon key. Ook e-mailadressen van medewerkers horen niet in de (publieke) repo.
4. **Eén stap per commit**, korte Nederlandse commit-berichten. Na elke fase: `git push` → controleren op `https://bwfcheckin.github.io/bwf-incheck/`.
5. **Privésauna blijft leidend tot begin oktober 2026.** Tot dan is de nieuwe agenda een leesspiegel van de kanalen. Bouw alles zo dat de bron later Planyo wordt zonder de agenda te herbouwen (zie fase 6).
6. **Huisstijl**: kleuren en lettertypes uit `agenda.html` / `bwf-agenda-stijl.css` (Cormorant Garamond + Public Sans, groen `#14342A`, goud `#B9975B`). Nieuwe pagina's gebruiken `bwf-shell.js` en `bwf-account.js` voor login en menu.
7. Bij twijfel: **vraag Angela**, bouw geen aannames in.
8. **Geen Make-scenario's.** Automatische taken (zoals de ICS-import) draaien in Supabase: Edge Function + `pg_cron`.
9. **SQL-migraties eerst laten zien.** Elke migratie staat in `supabase/migrations/` en wordt pas uitgevoerd na akkoord van Angela, na een proefdraai met rollback. Migraties verwijderen niets. Bij rechten-migraties staat vooraf een terugdraaiscript klaar in `supabase/rollback/`. Uitvoeren: `supabase db query --linked -f <bestand>`.

---

## 1. Wat er nu staat (inventarisatie, 11-09-2026)

**Pagina's die echt gebruikt worden**
- `vr2.html` — Virtual Assistent Dashboard (menu: Dagstart, Agenda, Welkomstcalls, Taken, Reserveringen & incheck, Klantbeheer, Belscripts, Gmail)
- `dashboard.html` — personeelsdashboard, wordt "BWF Locatie Lelystad"
- `agenda.html` + `bwf-agenda.js` + `bwf-kalender.js` — agenda, leest nu Google Agenda via edge function `agenda-bridge`
- `reserveringen.html`, `reservering-aanmaken.html`, `dagoverzicht.html`, `dagstart.html`, `vandaag.html`
- `incheckformulier.html` (locatiemanager) en `gast.html` (gastversie via `bwf-gastlink.js`)
- `klantbeheer.html` — klantenbestand, nachtregister, members
- `index.html` — portaal
- `supabase/functions/planyo-bridge/index.ts` — Planyo REST-koppeling (nu gepauzeerd)

**Supabase-tabellen die in de code voorkomen**
`res_koppeling`, `checkins`, `gast_aanmeldingen`, `wz_klantbeheer`, `wz_klantbeheer_instellingen`, `wz_medewerkers`, `bwf_rollen`, `wz_taken`, `wz_welkomstcalls`, `wz_werkzaamheden`, `wz_tarieven`, `uren_registratie`, `psm_administratie`, `bwf_instellingen`.

→ **Na fase 0:** de database telt 50 tabellen. Volledige lijst, kolommen en welke pagina wat gebruikt: `docs/INVENTARIS.md`. `bwf_instellingen` bestaat niet; de tabel heet `instellingen`.

**Eerste opdracht voor Claude Code (fase 0):** maak `docs/INVENTARIS.md` met per tabel de kolommen (`\d tabel`) en per pagina welke tabellen ze lezen/schrijven. Dan weten we zeker wat we samenvoegen.

---

## 2. Doel

Eén gedeelde agenda en één reserveringstabel in Supabase waar alle kanalen in samenkomen, zichtbaar per suite voor locatiemanagers, VR-assistent en eigenaar — met de juiste rechten, incheckformulieren, welkomstcalls, taken, voorraad, gastenregister en werkzaamhedenlog eraan gekoppeld.

**Kanalen** (commissie alleen ter informatie — die wordt niet in het reserveringsmodel berekend)
| Kanaal | Levert | Betaling | Commissie | Uitbetaling |
|---|---|---|---|---|
| Privésauna (SMG) | volledige gastgegevens (bevestigingsmail), beschikbaarheid via ICS | bij aankomst of vooraf via SMG | 10% + servicekosten | de 7e van de volgende maand |
| Origineel Overnachten | alleen voor- en achternaam | via Mollie/PayPal-link, direct op Mollie | 10% via aparte factuur | direct |
| Booking.com | volledige gegevens in pdf/reserveringsmail | vooraf betaald aan Booking.com | 12–15% | na dag van aankomst |
| Eigen website / Planyo (vanaf okt) | alles | Mollie/iDEAL | 0% | direct |

---

## 3. Datamodel (Supabase)

De SQL staat in `supabase/migrations/` (fase 1, migraties 1–4). Hieronder de opzet.

### 3.1 `reserveringen` — de ene bron van waarheid
Migratie `20260911120000_fase1_structuur.sql`. Kolommen:

| Groep | Kolommen |
|---|---|
| Verblijf | `suite` (`angie` / `malina_jacuzzi` / `malina_deluxe`), `kanaal` (`smg`, `oo`, `booking`, `planyo`, `eigen`, `handmatig`), `kanaal_ref`, `status` (`bevestigd`, `optie`, `geannuleerd`, `no_show`), `type` (`dagverblijf`, `avond`, `overnachting`, `late_checkin`, `honeymoon`), `tijdsblok_id` → `tijdsblokken`, `aankomst`, `vertrek`, `incheck_tijd` / `uitcheck_tijd` (alleen bij afwijking van het tijdsblok) |
| Import | `bron_uid` (UID uit de ICS-feed), `feed_gezien_op` (niet meer in de feed → `geannuleerd`) |
| Gast | `gast_voornaam`, `gast_achternaam`, `gast_email`, `gast_telefoon`, `gast_adres`, `personen` |
| Inhoud | `arrangementen`, `extras` (jsonb; leeg tot ingevuld via plak-/pdf-veld of handmatig), `omschrijving` |
| Geld (geen commissie) | `bedrag_totaal`, `betaald_via`, `betaalstatus` (`open`, `deels`, `betaald`), `restant_bedrag`, `uitbetaling_verwacht` (alleen de datum) |
| Bronmateriaal | `brongegevens` (tekst), `bron_bestanden` (paden in bucket `reservering-bijlagen`) |
| Koppelingen | `klant_id` → `wz_klantbeheer` (tekst-id), `checkin_id` → `checkins` (tekst-id), `welkomstcall_id` → `wz_welkomstcalls`, `nachtregister_id` → `wz_gastenregister` |
| Beheer | `aangemaakt_door`, `gewijzigd_door`, `created_at`, `updated_at` (trigger) |

Uniek: `(kanaal, kanaal_ref)` en `(kanaal, suite, bron_uid)`. Controle: `vertrek > aankomst`.

Migratie: bestaande `res_koppeling`/`checkins`-gegevens **niet** verwijderen maar via een migratiescript (`scripts/migreer-reserveringen.sql`) overzetten. Pas na controle door Angela de oude tabellen hernoemen naar `oud_*`.

**Suitenamen (besloten 11-09-2026):** overal `angie`, `malina_jacuzzi`, `malina_deluxe`. Malina Deluxe en Malina Zwembad zijn dezelfde suite. Omzetting van de waarden die nu in de database staan (zie `docs/INVENTARIS.md` §1.6), ook als functie `bwf_suite()`:

| Nu in de database | Wordt |
|---|---|
| `angie`, `Angie`, `Suite Angie Almere`, `PSA` | `angie` |
| `jacuzzi`, `Jacuzzi`, `Malina Jacuzzi`, `PSM` | `malina_jacuzzi` |
| `deluxe`, `zwembad`, `Malina Zwembad`, `PSMD` | `malina_deluxe` |

Bestaande tabellen en pagina's houden hun huidige waarden tot de migratie in fase 1; nieuwe code gebruikt alleen de drie nieuwe namen.

### 3.2 `blokkades` — beschikbaarheid / gesloten
`suite`, `van`, `tot`, `reden` (gesloten | onderhoud | eigen gebruik | ICS-import), `bron` (standaard `handmatig`), `bron_uid`, `aangemaakt_door`. Controle: `tot > van`.

### 3.3 `tijdsblokken` en `kanaal_instellingen` (aangepast 11-09-2026)
In- en uitchecktijden gelden **per suite én per tijdsblok**, niet per type. `tijdsblokken` komt exact overeen met SMG; de ICS-import herkent het blok aan begin- en eindtijd. Meerdere arrangementen met dezelfde tijden (bijv. Angie 13:00–11:00 met en zonder ontbijt, Jacuzzi 20:00–10:00 in vier varianten) delen één rij. De import bepaalt alleen suite, type en tijden; het arrangement blijft leeg tot het via het plak-/pdf-veld of handmatig wordt ingevuld.

Kolommen: `suite`, `type`, `naam`, `begin`, `eind`, `overnachting` (er wordt geslapen), `volgende_dag` (berekend: `eind <= begin`), `smg_room_id`, `actief`, `sortering`. Uniek: `(suite, begin, eind)`. Gegevens: migratie `20260911120100_fase1_tijdsblokken_kanalen.sql`.

| Suite (SMG room) | Dagverblijf | Avond | Overnachting | Late check-in | Honeymoon |
|---|---|---|---|---|---|
| `angie` (459) | 12:00–15:00, 12:00–16:00, 12:30–16:30, 13:00–16:00, 13:00–17:00, 13:00–18:00 | – | 13:00–11:00 | 20:00–11:00 | 01:00–15:00 |
| `malina_deluxe` (907) | 12:30–15:30, 12:30–16:30, 13:00–16:00, 13:00–17:00 | – | 13:00–11:00 | 19:00–11:00 | 01:00–15:00 |
| `malina_jacuzzi` (802) | 12:00–14:30, 12:00–16:00, 15:00–18:00 | 20:00–23:00 | 20:00–10:00 (enige variant; geen 13:00-incheck) | – | – |

Laat uitchecken (+€50, tot 12:00) is geen apart tijdsblok maar een afwijkende `uitcheck_tijd` bij het blok.

**`kanaal_instellingen`** — één rij per kanaal per suite: `extern_id`, `ics_secret` (alleen de **naam** van het Supabase-secret), `uitbetaalregel` (`direct`, `na_aankomst`, `dag7_volgende_maand`), `actief`. Alleen de eigenaar kan deze tabel lezen. Geen commissie of servicekosten.

| Suite | SMG room-ID | Booking.com hotel-ID | OO-snelcode | ICS-secrets |
|---|---|---|---|---|
| `angie` | 459 | 12955821 | 2750 | `ICS_ANGIE_SMG`, `ICS_ANGIE_BOOKING`, `ICS_ANGIE_OO` |
| `malina_deluxe` | 907 | 14967346 | 2900 | `ICS_MALINA_DELUXE_SMG`, `ICS_MALINA_DELUXE_BOOKING`, `ICS_MALINA_DELUXE_OO` |
| `malina_jacuzzi` | 802 | 16218254 | 2901 | `ICS_MALINA_JACUZZI_SMG`, `ICS_MALINA_JACUZZI_BOOKING`, `ICS_MALINA_JACUZZI_OO` |

De ICS-links zelf staan **alleen** als Supabase-secrets (gezet op 11-09-2026), nooit in HTML, JS, docs of git.

### 3.4 Rollen: `wz_medewerkers.toegangsrol` + `suites` en RLS
Nieuwe kolommen `toegangsrol` (`eigenaar`, `vr`, `locatiemanager`) en `suites text[]`. De bestaande kolom `rol` blijft ongewijzigd: `vr2.html` schrijft daar `eigenaar`/`medewerker` in, een controle op die kolom zou het opslaan van medewerkers breken. Row Level Security op `reserveringen`, `blokkades`, `wz_taken`, `checkins`, `voorraad`, `wz_werkzaamheden` volgens de matrix in §5 (migratie 4). Op bestaande tabellen alleen *restrictive* policies erbij; bestaande policies blijven staan.

| Medewerker | Toegangsrol | Suites |
|---|---|---|
| Angela | eigenaar | alle |
| Kelly | vr | alle |
| Senna | vr | alle |
| Ruth | locatiemanager | `malina_jacuzzi`, `malina_deluxe` |
| Michel | locatiemanager | alle drie |
| Jerry | locatiemanager | `malina_jacuzzi`, `malina_deluxe` |

Koppeling via `wz_medewerkers.auth_id` (login-account). E-mailadressen staan niet in de repo. Accounts zonder toegangsrol hebben na migratie 4 geen toegang tot deze tabellen.

### 3.5 `voorraad` en `voorraad_mutaties`
`voorraad` bestaat al (88 rijen) — uitbreiden (kolom `locatie`), niet opnieuw aanmaken. Nieuwe tabel `voorraad_mutaties`: `voorraad_id`, `oud_aantal`, `nieuw_aantal`, `reden`, `medewerker_id`, `auth_id`, `created_at`.

### 3.6 `wz_werkzaamheden` uitbreiden
Kolom `reservering_id` zodat elke gelogde taak van de VR-assistent aan een reservering hangt; maandoverzicht per medewerker × tarief → factuurbasis.

---

## 4. Fases

### Fase 0 — Inventaris en veiligheid (½ dag)
- [x] `docs/INVENTARIS.md` (tabellen + kolommen + welke pagina wat gebruikt)
- [x] `exports/` + `.gitignore`; volledige dump van Supabase (CSV/JSON per tabel + schema-snapshot; zie logboek)
- [x] Repo opschonen: `archief/`, `*.zip`, `files (5).zip`, map `~` en `*-test.html` beoordelen; verwijderen wat dubbel is (lijst eerst aan Angela laten zien)

### Fase 1 — Datamodel (1 dag)
- [x] ICS-links als Supabase-secrets (9 stuks, `ICS_<SUITE>_<KANAAL>`)
- [x] Migratie 1 `20260911120000_fase1_structuur.sql` (uitgevoerd 11-09-2026): extensies `pg_cron` + `pg_net`, `bwf_suite()`, `tijdsblokken`, `kanaal_instellingen`, `reserveringen`, `blokkades`, `voorraad_mutaties`, nieuwe kolommen, privé-bucket `reservering-bijlagen`
- [x] Migratie 2 `20260911120100_fase1_tijdsblokken_kanalen.sql` (uitgevoerd 11-09-2026): 21 tijdsblokken + 9 kanaalinstellingen
- [x] Migratie 3 `20260911120200_fase1_rollen.sql` (uitgevoerd 11-09-2026): toegangsrol en suites per medewerker (e-mailadressen bevestigd); Ruth, Michel en Jerry op `actief`
- [x] Migratie 4 `20260911120300_fase1_rechten.sql` (uitgevoerd 11-09-2026): RLS-policies (nieuwe tabellen + restrictive op bestaande tabellen + storage). Terugdraaien binnen een minuut: `supabase db query --linked -f supabase/rollback/20260911120300_fase1_rechten_terugdraaien.sql`
- [ ] Testaccounts per rol
- [ ] Migratiescript oude gegevens → `reserveringen` (`scripts/migreer-reserveringen.sql`): **na** de eerste ICS-import uit fase 2, want de SMG-reserveringsnummers in `res_koppeling.res_sleutel` koppelen dan op `kanaal_ref` (12 van de 68 nummers staan in de huidige SMG-feeds). De 36 rijen uit `reservations` apart overzetten als `kanaal = 'handmatig'`/`'planyo'`.

### Fase 2 — Import van de kanalen (1–2 dagen)
Geen Make-scenario's: de import draait volledig in Supabase.

**Wat de feeds leveren** (gecontroleerd 11-09-2026, alleen tijden en aantallen bekeken):
- **SMG** (tijden met tijdzone Europe/Amsterdam): events **mét** beschrijving zijn echte SMG-boekingen (status CONFIRMED). De UID is het 6-cijferige reserveringsnummer; de beschrijving heeft de velden `Reserveringsnummer`, `Aantal personen`, `E-mail`, `Tel`, `Arrangementen`, `Opties`, `Omschrijving`, `Betalen bij Aankomst`; de titel is de gastnaam — 33 van de 138. Events **zonder** beschrijving (105) zijn handmatige regels in de SMG-planning met titels als "Booking.com", "Origineel overnachten", "Late check-in", "WhatsApp", "Planyo", "niet beschikbaar", "Vol".
- De meeste SMG-tijden vallen in een tijdsblok, maar niet allemaal: o.a. 19:00–12:00 en 20:00–12:00 (laat uitchecken), 20:00–20:00, 15:00–11:00 over meerdere nachten, 12:00–17:00.
- **Booking.com**: alleen datums (geen tijden), titel "CLOSED – Not available", geen gastgegevens; ook lange sluitingen (21 en 418 nachten).
- **Origineel Overnachten**: datum 00:00–00:00, titel "… origineel overnachten - Voornaam Achternaam", geen tijden.
- Booking.com- en OO-feed van `malina_jacuzzi` zijn nu leeg.

**Importregels (besloten 11-09-2026, §6 vragen 9 en 10):**
1. **SMG-boeking** (beschrijving met `Reserveringsnummer`) → `kanaal = 'smg'`, `kanaal_ref` = reserveringsnummer; gastnaam uit de titel, e-mail, telefoon en personen uit de beschrijving; titel + beschrijving in `brongegevens`.
2. **Handmatige SMG-regel** → reservering met het kanaal uit de titel ("Booking" → `booking`, "Origineel" → `oo`, "Planyo" → `planyo`, anders `handmatig`), `kanaal_ref = smg-regel:<suite>:<begin>-<eind>` (bij gelijke tijden `#2`, `#3`) — SMG geeft deze regels bij elke download een nieuwe UID, dus die is geen sleutel. Blokkades: `smg-blok:<suite>:<begin>-<eind>`. Titel met "niet beschikbaar" of "Vol" → blokkade.
3. **Booking.com** → reservering (`overnachting`) tot en met 14 nachten, `kanaal_ref` = UID; langer → blokkade. **Aanvulling 11-09-2026:** overlapt de Booking.com-sluiting met een OO-boeking of een SMG-boeking (met reserveringsnummer) van dezelfde suite, dan is het geen tweede gast maar een sluiting → blokkade ("nacht bezet via OO/SMG").
4. **Origineel Overnachten** → reservering (`overnachting`), gastnaam uit de titel (na " - "), `kanaal_ref` = UID.
5. **Samenvoegen:** een handmatige SMG-regel die begint binnen de nachten van een Booking.com/OO-boeking van dezelfde suite wordt één reservering: kanaal en referentie van Booking.com/OO, in- en uitchecktijd uit de SMG-regel. Een overlappende "niet beschikbaar"/"Vol"-regel vervalt dan.
6. **Tijdsblok:** exacte begin- en eindtijd → tijdsblok + type. Zelfde begintijd, andere eindtijd (en maar één blok met die begintijd) → dat blok + afwijkende `uitcheck_tijd`. Anders geen blok: tijden in `incheck_tijd`/`uitcheck_tijd`, type `overnachting` (over middernacht) of `dagverblijf`, plus een `import_opmerking` om te controleren. Booking.com/OO zonder SMG-regel krijgen de tijden van het overnachtingsblok van de suite.
7. **Bijwerken (aangepast 11-09-2026, migratie 7):** bij een bestaande reservering werkt de import altijd alleen aankomst, vertrek, status (annuleren/terugzetten), uitbetaaldatum en feedgegevens bij. Type, tijdsblok, afwijkende tijden, opmerking en personen alleen zolang niemand de reservering handmatig heeft gewijzigd (`handmatig_gewijzigd_op`, gevuld door een trigger bij elke wijziging door een ingelogde gebruiker). Gastgegevens en `brongegevens` worden alleen ingevuld als ze nog leeg zijn. Arrangementen, extra's, bedragen, betaalstatus, omschrijving en `gewijzigd_door` raakt de import niet aan.
8. **Annuleren:** een reservering die niet meer in haar feed staat en waarvan de aankomst nog moet komen → `geannuleerd` (`geannuleerd_door_import = true`); komt ze terug, dan weer `bevestigd`. Het verleden blijft ongemoeid. Blokkades → `actief = false`. Een lege feed annuleert niets. Mislukt één feed van een suite, dan wordt die suite in die run niet aangeraakt.
9. **`uitbetaling_verwacht`** (alleen datum): `direct` = aankomstdatum, `na_aankomst` = dag na aankomst, `dag7_volgende_maand` = de 7e van de maand na aankomst.

- [x] Migratie 5 `20260911130000_fase2_import.sql` (uitgevoerd 11-09-2026): kolommen `bron_feed`, `import_opmerking`, `geannuleerd_door_import` (reserveringen) en `feed_gezien_op`, `actief` (blokkades); logtabel `kanalen_sync_log`; functie `kanalen_verwerk()` (alleen service role)
- [x] Edge function `kanalen-sync` (`supabase/functions/kanalen-sync/index.ts`): aanroep met header `x-sync-token`; `?proef=1` verwerkt en telt zonder te schrijven — gedeployed 11-09-2026 zonder JWT-controle (weigert zonder token met 401); tijdelijk token tot migratie 6
- [x] Proefimport goedgekeurd; eerste echte import 11-09-2026 12:28: 9 feeds gelukt, 131 reserveringen, 14 blokkades
- [x] Migratie 6 `20260911130100_fase2_cron.sql` (uitgevoerd 11-09-2026; hetzelfde token staat als secret `KANALEN_SYNC_TOKEN` bij de Edge Function; cronjob op 11-09-2026 om 12:31 gepauzeerd na dubbele rijen en na de fix weer aangezet, zie logboek): token in Vault + `pg_cron`-job elke 15 minuten via `pg_net`
- [x] Migratie 7 `20260911140000_fase2_handmatig_behouden.sql` (uitgevoerd 11-09-2026): import laat handmatig ingevulde gegevens met rust (regel 7)
- [x] Eenmalig `20260911140100_fase2_dubbele_opruimen.sql` (uitgevoerd 11-09-2026, export vooraf in `exports/2026-09-11-opruimen/`): dubbele rijen van 12:30 weg, vaste sleutels voor handmatige SMG-regels, 11 onterechte annuleringen terug
- [x] `kanalen-sync` opnieuw deployen met vaste sleutels (versie 2); twee importruns zonder verschil; cronjob weer aan (11-09-2026)
- [ ] Gastgegevens die niet in de ICS staan (Booking.com-pdf/mail, OO) aanvullen via het plak-/uploadveld uit fase 4
- [ ] `agenda-bridge` (Google Agenda) mag blijven als extra bron, maar wordt niet meer de basis

### Fase 3 — Agenda en dagoverzicht (1–2 dagen)
- [x] `agenda.html` ombouwen naar `reserveringen` + `blokkades`: dag / week / maand, filter per suite, kleur per kanaal en status (11-09-2026; gedeelde component `bwf-kalender.js` v2, blokkeren schrijft naar `blokkades`)
- [x] Onder de kalender een uitklaplijst met de reserveringen van de gekozen dag/periode (knoppen naar `reservering-beheer.html?id=` en vooringevuld incheckformulier; vrije tijdsblokken per suite)
- [x] Dagstart in `vr2.html` en startscherm `dashboard.html` (alleen Lelystad) laden dezelfde component (`bwf-kalender.js`) — één kalender, twee dashboards (11-09-2026: vr2 in de Agenda-tab, dashboard als Vandaag-weergave; `dagoverzicht.html` leest ook uit `reserveringen`)
- [x] Knoppen: reservering openen, incheckformulier, welkomstcall, taak aanmaken (11-09-2026, `bwf-kalender.js` v3: Welkomstcall opent vr2 met ingevuld formulier, alleen eigenaar/VR; Taak maakt een `wz_taken`-regel met link naar de reservering, iedereen met een toegangsrol)
- [ ] Later: ICS-feed **uit** Supabase (`/functions/v1/agenda-ics?token=…`) zodat Apple/Google Agenda meelezen

### Fase 4 — Reservering, pdf/plakveld en formulieren (2 dagen)
- [ ] **Voorrang 11-09-2026, vóór fase 3:** uitgeklede versie `reservering-beheer.html` voor Kelly — lijst vandaag + 30 dagen (filter suite, kanaal, status; markering gastgegevens ontbreken / tijden controleren), formulier (gast, personen, type/tijdsblok, arrangementen als vrije tekst, bedrag, betaalstatus, status, omschrijving, afwijkende in-/uitchecktijd), plakveld met eenvoudige herkenning (vult alleen lege velden, tekst wordt aan `brongegevens` toegevoegd), knop Bevestigd (status + `gewijzigd_door`), menu-item "Reserveringen (nieuw)" in `vr2.html`. Geen pdf, Mollie of koppelingen: die volgen in de volledige fase 4. Gebouwd en online op 11-09-2026; test met Kelly volgt.
- [x] Welkomstcalls, borg en schade naar `reserveringen` (12-09-2026, migratie 8): `wz_welkomstcalls.reservering_id` (unieke index: één call per reservering) en `uitkomst`; `schade.reservering_id`; borg-, notitie-, medewerker- en reviewvelden op `reserveringen`. `vr2.html` maakt calls aan uit `reserveringen` (geen dubbele meer, geannuleerde krijgen er geen), `vandaag.html` en `dashboard.html` lezen uit `reserveringen` en schrijven naar de juiste tabel.
- [x] **Google Agenda is nergens meer een bron** (12-09-2026): `vandaag.html`, `dashboard.html`, `dagstart.html`, `incheckformulier.html`, `klantbeheer.html`, `reserveringen.html` en de oude reserveringslijst in `vr2.html` lezen uit `reserveringen`; `reservering-aanmaken.html` schrijft een eigen boeking als gewone reservering (kanaal `eigen`). `bwf-agenda.js` wordt door geen enkele pagina meer geladen. `bwf-planyo.js` blijft alleen voor de Planyo-knoppen en `BWFSync` (tot fase 6). Restant: `controle.html` test `res_koppeling` nog als diagnose, en de oude gegevens in `res_koppeling`/`reservations` staan er nog (punt 3 van Angela).
- [ ] `reservering.html` (detail): gast, verblijf, geld, bronmateriaal, koppelingen, wijzigingslog
- [ ] Plak-/uploadveld: pdf (pdf.js), txt, Excel (SheetJS), foto (Tesseract.js of handmatig); tekst → `brongegevens`; velden voorvullen via herkenning (Booking.com-pdf, SMG-tekst, OO-bevestiging/Mollie-bon). Zelfde component in de welkomstcall
- [ ] Incheckformulieren-dropdown met drie staten: **klaargezet** (na welkomstcall), **nieuw/leeg**, **definitief**
- [ ] `incheckformulier.html`: openen, bewerken, opslaan, koppelen aan reservering; concept toewijzen aan locatiemanager; gastlink genereren
- [ ] Welkomstcall: reservering kiezen → extra's bijboeken → WhatsApp/e-mail → Mollie-link voor restant/extra's
- [ ] Automatisch klant aanmaken/samenvoegen in `wz_klantbeheer`; overnachting doorzetten naar nachtregister
- [ ] Bekende bugs meenemen: arrangementen/betaling niet opgeslagen, gastformulier leegt velden en handtekening, geen bedrag bij aanmaken
- [ ] Gewenste functies uit het verwijderde `archief/dashboard-test.html` terugbrengen in `dashboard.html`: (1) handmatige in-/uitchecktijd (`tijd_in`/`tijd_uit`, gaat vóór de tijd uit de agenda), (2) welkomstcall-status op de reserveringskaart, (3) "Besproken" op de reserveringskaart. Oude code: `git show 5d26838:archief/dashboard-test.html`

### Fase 5 — Rollen, taken, voorraad, werkzaamheden (1–2 dagen)
Rollen en suites per medewerker: zie §3.4. Pagina's gaan `toegangsrol` en `suites` gebruiken in plaats van `rol`.
- [ ] Menu en knoppen per rol (matrix §5); alles wat niet mag is ook niet zichtbaar
- [ ] Taken: aanmaken, toewijzen, overdragen, afvinken, verwijderen (VR/eigenaar)
- [x] `vr2.html` verwees naar de niet-bestaande tabel `wz_planning` (console: 404) — opgelost 11-09-2026: de aanroep stond alleen in de telling van de tegel "Planning · deze week" en is weggehaald; de tegel telt diensten uit `planning`.
- [ ] Taak openen in `vr2.html` bestaat nog niet: een taak heeft alleen de knoppen overdragen, bezig, afvinken, heropenen en verwijderen. Venster bouwen om een taak te bekijken en te wijzigen (`wz_taken`: titel, toelichting, deadline, prioriteit, toegewezen persoon, link).
- [ ] Voorraadbeheer als pagina in beide dashboards
- [ ] Voorraad als eigen knop boven in de menubalk van `dashboard.html` én `vr2.html` (wens Angela). Nu zit voorraad in `dashboard.html` onder het oude overzicht en is de tab `tab-voorraad` verborgen.
- [ ] Lege voorraadlijst in `dashboard.html` terwijl de tabel 88 rijen heeft (melding Angela 11-09-2026). Bevinding: de tegels onder het overzicht (blok B, `sb('voorraad…')`) en de volledige lijst (blok A, paneel `panel-voorraad`) laden los van elkaar. Blok A laadt pas na de toegangscode-poort, met een eigen `sessieToken()`, en haalt vijf tabellen in één `Promise.all` op (`medewerkers`, `planning`, `voorraad`, `overdracht`, `instellingen`): mislukt er één of is de sessie verlopen, dan blijft de hele lijst leeg (status "Verbinding mislukt", console `Supabase: …`). Sinds migratie 4 ziet een account zonder toegangsrol ook geen voorraad. Oorzaak in de browser vaststellen; geen kleine fix.
- [ ] Werkzaamhedenlog met `reservering_id`; maandoverzicht per medewerker → export voor factuur
- [ ] Externe knoppen: Gmail, Wati, SMG-dashboard, Booking.com extranet, OO, Planyo, Mollie — openen in nieuw tabblad (iframes worden door die sites geblokkeerd)

### Fase 6 — Overstapdag Planyo (begin oktober)
- [ ] `planyo-bridge` weer aanzetten; Planyo schrijft naar `reserveringen` met `kanaal='planyo'`
- [ ] Booking.com aan Planyo-XML, OO aan Planyo-ICS
- [ ] ICS-import van Privésauna uitzetten (`pg_cron`-job aanpassen), historie blijft staan

### Fase 7 — Testen als klant en opnieuw opbouwen
- [ ] Testreserveringen via `gast.html`, `boeking`-flow, Booking.com-pdf en SMG-plak
- [ ] Testdata markeren met `kanaal_ref like 'TEST-%'` zodat ze in één keer weg kunnen
- [ ] Angela loopt alle rollen door met testaccounts; daarna livezetten

---

## 5. Rechtenmatrix

| Actie | Locatiemanager | VR-assistent | Eigenaar |
|---|---|---|---|
| Agenda + reserveringen eigen suite(s) bekijken | ✔ | ✔ alle | ✔ alle |
| Reservering bewerken | – | ✔ | ✔ |
| Incheckformulier openen / bewerken / opslaan | ✔ | ✔ | ✔ |
| Incheckformulier koppelen, concept klaarzetten, toewijzen | – | ✔ | ✔ |
| Gastlink / welkomstmail / Mollie-link versturen | – | ✔ | ✔ |
| Welkomstcall uitvoeren | – | ✔ | ✔ |
| Taak aanmaken en toewijzen | ✔ | ✔ | ✔ |
| Taak afvinken / verwijderen (ook van anderen) | eigen | ✔ | ✔ |
| Klant aanmaken / bewerken | notities | ✔ | ✔ |
| Nachtregister invullen | – | ✔ | ✔ |
| Toeristenbelasting-bedragen | – | – | ✔ |
| Voorraad bekijken / aanpassen | ✔ | ✔ | ✔ |
| Werkzaamheden loggen | – | ✔ (eigen) | ✔ alles |
| Tarieven, kanaalinstellingen, medewerkers, exports | – | – | ✔ |

---

## 6. Open beslissingen voor Angela
1. Oude tabellen (`res_koppeling`, `checkins`) na migratie hernoemen naar `oud_*` of direct verwijderen?
2. ~~Standaard in-/uitchecktijden per type~~ **Besloten 11-09-2026:** tijden per suite en tijdsblok, exact SMG (§3.3).
3. ~~ICS-URL's aanleveren~~ **Besloten 11-09-2026:** aangeleverd en als Supabase-secrets opgeslagen.
4. ~~Welke locatiemanager mag welke suite(s) zien?~~ **Besloten 11-09-2026:** zie §3.4.
5. ~~Import elke 15 minuten: via `pg_cron` of via Make?~~ **Besloten 11-09-2026:** via `pg_cron` in Supabase, geen Make.
6. Gmail in het dashboard: knop naar Gmail (nu) of later echte Gmail-API-koppeling (apart project)?
7. ~~`uitbetaling_verwacht` behouden nu de commissie vervalt?~~ **Besloten 11-09-2026:** blijft, alleen de datum (geen bedragen).
8. ~~Is `PSM` de Malina Jacuzzi?~~ **Besloten 11-09-2026:** `PSM` = `malina_jacuzzi`, `PSMD` = `malina_deluxe`, `PSA` = `angie`.
9. ~~Handmatige regels in de SMG-planning?~~ **Besloten 11-09-2026:** reservering met kanaal uit de titel; "niet beschikbaar"/"Vol" als blokkade; bij overlap met Booking.com/OO samenvoegen (fase 2, regels 2 en 5).
10. ~~Booking.com-feed als reservering of blokkade?~~ **Besloten 11-09-2026:** reservering tot en met 14 nachten, langer als blokkade (fase 2, regel 3). Aanvulling 11-09-2026: bij overlap met een OO- of SMG-boeking altijd blokkade.
11. ~~Telt Honeymoon als overnachting?~~ **Besloten 11-09-2026:** ja (nachtregister/toeristenbelasting).
12. ~~OO-snelcodes?~~ **Besloten 11-09-2026:** 2750 = `angie`, 2900 = `malina_deluxe`, 2901 = `malina_jacuzzi`.
13. ~~Accounts zonder toegangsrol?~~ **Besloten 11-09-2026:** urenstaat-account, reserveringen-account en tweede info-account krijgen geen toegangsrol en dus geen toegang tot incheckformulieren, taken, voorraad en werkzaamheden.
14. ~~Ruth, Michel en Jerry op actief?~~ **Besloten 11-09-2026:** ja, in migratie 3.

---

## 7. Werkwijze per sessie in Claude Code
```
cd ~/bwf-incheck && git pull
# lees PLAN-AGENDA-EN-RESERVERINGEN.md, kies de volgende open [ ] taak
# bouw, test lokaal (python3 -m http.server 8000), commit, push
# vink de taak af in dit bestand en noteer afwijkingen onder "Logboek"
```

## Logboek
- 11-09-2026 — plan opgesteld.
- 11-09-2026 — fase 0: `docs/INVENTARIS.md` gemaakt uit de live database en de code. Export in `exports/2026-09-11/` (50 tabellen, aantallen gecontroleerd, plus storage-bestanden, broncode edge functions, policies/functies/views). Afwijking: geen `pg_dump` (geen Docker/psql op de Mac); export via `supabase db query --linked`. De database telt 50 tabellen i.p.v. de 14 uit §1 — zie INVENTARIS §1 voor besluiten vóór fase 1. Er is nog niets verwijderd.
- 11-09-2026 — besluiten Angela: (a) suitenamen overal `angie`, `malina_jacuzzi`, `malina_deluxe` (Malina Zwembad = Malina Deluxe); (b) geen Make-scenario's, ICS-import via Supabase-functie + `pg_cron` (spelregel 8, fase 2); (c) geen commissieberekening in het reserveringsmodel: `commissie_pct`, `commissie_bedrag` en `bedrag_netto` vervallen, `bedrag_bruto` heet nu `bedrag_totaal`, commissie/servicekosten uit `kanaal_instellingen`. `vr2.html` lokaal hersteld (was 0 bytes), leeg bestand `main` verwijderd.
- 11-09-2026 — agendasleutel uit de HTML gehaald; `dashboard`, `dagoverzicht` en `incheckformulier` laden de agenda via `bwf-agenda.js` / `agenda-bridge` (commit `5d26838`). Sleutel vervangen: `docs/SLEUTEL-ROTATIE.md`.
- 11-09-2026 — besluiten Angela: `uitbetaling_verwacht` blijft (alleen datum); `PSM` = `malina_jacuzzi`, `PSMD` = `malina_deluxe`, `PSA` = `angie`.
- 11-09-2026 — repo opgeschoond (commit "Opschonen repo"): archief, testpagina's, `vrdashboard.html`, `bwf-reservering-extra.js`, beide zips en map `~` verwijderd; `archief/boeking.html` → `boeking.html` (boeking-flow fase 7); afbeeldingen uit `files (5).zip` → `afbeeldingen/`; links naar `beschikbaarheid2.html` → `agenda.html` en naar `vrdashboard.html` → `vr2.html`; `supabase/.temp/` uit git. Fase 0 afgerond.
- 11-09-2026 — fase 1 gestart. Aanpassing §3.3: tijden per suite én tijdsblok (tabel `tijdsblokken`, exact SMG). 9 ICS-links als Supabase-secrets gezet en gecontroleerd (alle feeds bereikbaar). Rollen en suites vastgelegd in §3.4. Migraties 1–4 geschreven in `supabase/migrations/`, nog **niet** uitgevoerd (wacht op akkoord). Rollen in nieuwe kolom `toegangsrol` i.p.v. `rol` (zou `vr2.html` breken). Migratie van oude reserveringsgegevens verschoven naar na de eerste ICS-import.
- 11-09-2026 — besluiten Angela: e-mailadressen bevestigd; honeymoon telt als overnachting; OO-snelcodes 2750/2900/2901 = angie/malina_deluxe/malina_jacuzzi; accounts zonder toegangsrol krijgen geen toegang; Ruth, Michel en Jerry op actief (migratie 3). Proefdraai met rollback van migraties 1–4 + terugdraaiscript geslaagd (rechten getest als eigenaar, vr, locatiemanager, account zonder rol en anoniem; niets blijven staan). Migraties 1 en 2 uitgevoerd en gecontroleerd; bestaande policies op `checkins`, `wz_taken`, `voorraad`, `wz_werkzaamheden` ongewijzigd. Migraties 3 en 4 wachten op controle van dashboard, vr2 en incheckformulier door Angela.
- 11-09-2026 — `dashboard.html`: `opVandaag` teruggezet (commit `e93f8bc`); de functie viel weg in `ed2a745` (08-09-2026), niet in `5d26838`. Migraties 3 en 4 uitgevoerd: 6 medewerkers met toegangsrol (alle actief), 21 policies en 3 functies; de oude policies op `checkins`, `wz_taken`, `voorraad` en `wz_werkzaamheden` staan er nog. Controle per rol (in een teruggedraaide transactie): eigenaar/vr zien 88 incheckformulieren, Ruth en Jerry 57 (Malina), Michel 88; kanaalinstellingen alleen eigenaar; urenstaat-account alleen urenstaat; anoniem alleen documenten. Consolemeldingen `wz_planning` (vr2) en lege voorraadlijst (dashboard) genoteerd bij fase 5. Wacht op test door Angela, Senna en Ruth; daarna migraties en plan committen.
- 11-09-2026 — migraties, terugdraaiscript en plan gecommit (`b9b8a97`). `vr2.html`: niet-bestaande tabel `wz_planning` uit de Planning-telling gehaald. Taak openen bestaat niet in vr2 — genoteerd bij fase 5. Klantkaart in `klantbeheer.html` werkt (melding ingetrokken).
- 11-09-2026 — fase 2 gestart. Besluiten Angela: vraag 9 (handmatige SMG-regels als reservering, "niet beschikbaar"/"Vol" als blokkade, samenvoegen bij overlap) en vraag 10 (Booking.com tot 14 nachten reservering). Importregels uitgewerkt; migratie 5 (import), Edge Function `kanalen-sync` en migratie 6 (cron) geschreven, nog niet uitgevoerd of gedeployed. Klantkaart bevestigd werkend na commit `66a004b`.
- 11-09-2026 — `kanalen-sync` gedeployed; proefimport (niets geschreven): 131 reserveringen (angie 45, malina_deluxe 67, malina_jacuzzi 19), 14 blokkades, 5 keer samengevoegd, 99 met tijdsblok, 0 onleesbare events; de rest heeft een `import_opmerking` (afwijkende tijden). Proefdraai migraties 5 en 6 met rollback geslaagd: aanmaken, bijwerken zonder handmatige gastgegevens te overschrijven, annuleren en terugzetten, blokkade opheffen, lege feed annuleert niets, uitbetaaldatum (SMG 7e volgende maand, Booking.com dag na aankomst), functie alleen voor service role, cronjob en Vault-token; niets blijven staan. Migraties 5 en 6 wachten op akkoord.
- 11-09-2026 — akkoord Angela op migraties 5 en 6. Beide uitgevoerd en gecontroleerd (kolommen, logtabel met RLS, functie alleen service role, cronjob elke 15 minuten, token in Vault = secret van de Edge Function). Eerste import handmatig gestart om 12:28: 9 feeds gelukt, 131 reserveringen (angie 45, malina_deluxe 67, malina_jacuzzi 19; 32 toekomstig), 14 blokkades, 0 geannuleerd — gelijk aan de proef. 99 met tijdsblok; 50 met een opmerking over afwijkende tijden om te controleren. Per kanaal: smg 33 (met gastnaam), booking 21, oo 12, handmatig 63, planyo 2.
- 11-09-2026 — incident: de automatische importrun van 12:30 maakte de 88 handmatige SMG-regels en 12 SMG-blokkades opnieuw aan (SMG geeft die regels bij elke download een nieuwe UID) en annuleerde 11 toekomstige regels uit de run van 12:28. Echte SMG-boekingen, Booking.com en OO niet geraakt. Cronjob om 12:31 gepauzeerd (`cron.alter_job active = false`, niets verwijderd). Fix: vaste sleutel uit suite + begin + eind (`kanalen-sync`), migratie 7 (handmatige invoer blijft staan, wens Angela) en eenmalig opruimscript; proefdraai met rollback geslaagd (131 reserveringen, 14 blokkades, Kelly-wijziging blijft staan na import). Tegelijk `reservering-beheer.html` gebouwd (voorrang fase 4-light). Wacht op akkoord voor uitvoering.
- 11-09-2026 — akkoord Angela op migratie 7 en opruimscript. Export vooraf (219 reserveringen, 26 blokkades, 18 logregels) in `exports/2026-09-11-opruimen/`. Migratie 7 en opruimscript uitgevoerd: 131 reserveringen, 0 geannuleerd, 14 blokkades, 88 vaste sleutels `smg-regel:…` en 12 `smg-blok:…`. `kanalen-sync` versie 2 gedeployed; twee handmatige importruns zonder verschil (9 feeds gelukt, 0 nieuwe rijen, 0 geannuleerd). Cronjob weer aan. `reservering-beheer.html` en menu-item in `vr2.html` online gezet.
- 11-09-2026 — dubbele regels door Booking.com-sluitingen: de Booking.com-feed zet "CLOSED" op nachten die via OO of SMG bezet zijn (13–14 sep en 6–8 nov malina_deluxe stonden dubbel met een OO-boeking). Besluit Angela: bij overlap = blokkade. `kanalen-sync` versie 3 gedeployed (cronjob tijdens deploy gepauzeerd, export vooraf in `exports/2026-09-11-booking-sluitingen/`). Proef en import zoals verwacht: de 2 Booking.com-regels geannuleerd door de import (terug te zetten), 2 blokkades erbij (16 actief), 132 reserveringen, 0 nieuwe rijen. 22–23 dec blijft een Booking.com-reservering (geen overlap). Cronjob weer aan. Eerste automatische run om 15:00 (versie 2) was stabiel; 1 nieuwe echte SMG-boeking om 14:30.
- 11-09-2026 — fase 3 gestart. `kanalen-sync` versie 4: bij een 504 van de verwerkfunctie één keer opnieuw (vier incidentele 504's tussen 18:15 en 20:45, functie zelf ~17 ms). Onderdeel 1: `bwf-kalender.js` v2 als gedeelde component (`BWFKalender.maak`): leest alleen `reserveringen` + `blokkades`, dag/week/maand, suitefilter, kleur per kanaal, geannuleerd grijs, optie gestippeld, blokkades gearceerd, titels afgekapt, tijden in Europe/Amsterdam, meerdaagse verblijven op elke nacht, uitklaplijst van de gekozen dag. `agenda.html` opnieuw opgebouwd op de component (blokkeren/opheffen via `blokkades`, vrije tijdsblokken per suite). `index.html` laadt v2. `reservering-beheer.html?id=` opent direct één reservering. Let op: `reservering-aanmaken.html` schrijft blokkades nog naar `res_koppeling`.
- 11-09-2026 — fase 3 onderdelen 2–4: `dagoverzicht.html` leest `reserveringen` + `blokkades` (commit `87f14fa`); vr2 Agenda-tab toont de gedeelde kalender, oude kalender en reserveringslijst verborgen, diensten blijven (`79b9cd7`); dashboard Vandaag = gedeelde kalender voor Lelystad, kaarttitel afgekapt met … (link naar het oude vandaag-scherm blijft). **Nog op Google Agenda (agenda-bridge):** de welkomstcall-automatiek en koppelingen in vr2 (wacht op keuze Angela, advies: tot fase 4 laten staan), het ingeklapte oude overzicht en de reserveringskaart in `dashboard.html`, `vandaag.html` en `reserveringen.html`. `reservering-aanmaken.html` schrijft blokkades nog naar `res_koppeling`.
- 11-09-2026 — besluiten Angela: vr2 welkomstcall-automatiek blijft tot fase 4 op de oude agendafeed (advies); `vandaag.html`, `reserveringen.html` en het oude overzicht/reserveringskaart in `dashboard.html` blijven tot fase 4 op Google Agenda/`res_koppeling`. `reservering-aanmaken.html`: blokkeren schrijft nu naar `blokkades` (bron `handmatig`), de lijst leest `blokkades`, opheffen zet `actief = false`.
- 11-09-2026 — akkoord Angela: de laatste oude blokkade uit `res_koppeling` (malina_deluxe, 10-09 12:30 – 11-09 11:00, al voorbij) overgezet naar `blokkades` met migratie `20260911160000_fase3_oude_blokkade.sql` (proefdraai met rollback vooraf; `res_koppeling` ongewijzigd). De nieuwe agenda toont nu alle blokkades.
- 11-09-2026 — fase 3 afgerond op de Google Agenda-restanten na (tot fase 4). Daglijst van de kalender heeft nu de knoppen Reservering, Incheckformulier, Welkomstcall (eigenaar/VR) en Taak (iedere rol); rechten getest in een teruggedraaide proef (Kelly en Ruth mogen een taak aanmaken, urenstaat-account niet).
- 12-09-2026 — fase 4 gestart met de welkomstcalls, borg en schade. Migratie 8 (`20260912090000_fase4_koppelingen.sql`, met terugdraaiscript) na proefdraai met rollback uitgevoerd: `wz_welkomstcalls.reservering_id` + `uitkomst` met een unieke index (één call per reservering), `schade.reservering_id`, en op `reserveringen` de velden `borg_*`, `betaald_bedrag`, `notitie`, `medewerker`, `geannuleerd_op`, `review_taak_id`, `review_verstuurd`, `gastlink_verstuurd`. Drie bestaande calls gekoppeld op SMG-nummer; de rest van de 53 calls heeft geen bruikbaar nummer (Planyo-UID's, of titels als "Betaling" en "Menu" die de oude automatiek als naam aanzag). Bevinding: borg was nergens gevuld (geen bedrag boven nul) en `schade` was leeg, dus de verhuizing was code en geen data. Commits `10f0577` (vr2 + migratie), `70000d7` (`vandaag.html`), `4bc6fc5` (`dashboard.html`). Regel die we vasthouden: automatische stappen schrijven niet naar `reserveringen`, want de trigger zet dan `handmatig_gewijzigd_op` en daarna werkt de import type, tijden, opmerking en personen niet meer bij (datums en status blijft de import wél bijwerken). Ook: `reserveringen.kanaal` wordt door de pagina's niet overschreven — dat is samen met `kanaal_ref` de sleutel van de import.
- 12-09-2026 — rest van fase 4-punt "Google Agenda eruit" afgemaakt. `vandaag.html` (`70000d7`), `dashboard.html` (`4bc6fc5`), ontdubbelen van welkomstcalls (`961357a`), `dagstart.html` (`b1b4f25`), `incheckformulier.html` + `klantbeheer.html` (`c7d0f05`), `reserveringen.html` (`89f1252`), en tot slot `vr2.html` + `reservering-aanmaken.html` (`cfa86d4`). `bwf-agenda.js` wordt nergens meer geladen; `agenda-bridge` blijft bestaan maar is geen bron meer. Werkwijze die we aanhielden: waar een pagina veel plekken uit `res_koppeling` las, vullen we `KOPPEL` nu uit de reservering zelf plus de gekoppelde welkomstcall onder dezelfde veldnamen — lege waarden overschrijven niets, dus oude gegevens blijven zichtbaar. Schrijven gaat per veld naar de juiste tabel (borg/notitie/tijden/koppelingen → `reserveringen`, bijgeboekte extra's en betaalwijze → `wz_welkomstcalls`, de rest blijft `res_koppeling`). Opgemerkt: de oude automatiek had 50 losse calls gemaakt (ook op titels als "Betaling" en "Menu"); 11 daarvan horen bij een openstaande boeking en worden nu gekoppeld in plaats van gedupliceerd. Ook opgelost: `dagstart.html` en de klantkaart toonden nooit een locatie (kolom werd niet opgehaald). Let op voor de test: 10 toekomstige boekingen hebben nog geen gastnaam (SMG-planningsregels), die tonen als "Naam onbekend" tot iemand ze aanvult.
