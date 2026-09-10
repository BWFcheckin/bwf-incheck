# PLAN — Eén agenda, reserveringen per kanaal en rollen
Bed & Wellness Flevoland · repo `bwf-incheck` · Supabase project `iuyjvtlauktnjprbmbjj`
Opgesteld 11-09-2026. Dit bestand is de opdracht voor Claude Code op de MacBook (`~/bwf-incheck`).

---

## 0. Spelregels voor Claude Code

1. **Eerst lezen, dan bouwen.** Begin elke sessie met `git pull` en lees dit plan plus `README.md` en `LEESMIJ-wijzigingen.md`.
2. **Niets weggooien zonder export.** Vóór elke `drop`/`truncate`/`delete` op Supabase eerst een export naar `exports/YYYY-MM-DD/<tabel>.csv` (via `supabase db dump` of `psql \copy`). Exports worden **niet** gecommit (`exports/` in `.gitignore`).
3. **Geen geheimen in de repo.** Service-role key, Google-agendasleutel, Make-webhooks en ICS-URL's staan alleen in Supabase (secrets / tabel `bwf_instellingen`) of in een lokale `.env` die in `.gitignore` staat. In HTML/JS alleen de publieke anon key.
4. **Eén stap per commit**, korte Nederlandse commit-berichten. Na elke fase: `git push` → controleren op `https://bwfcheckin.github.io/bwf-incheck/`.
5. **Privésauna blijft leidend tot begin oktober 2026.** Tot dan is de nieuwe agenda een leesspiegel van de kanalen. Bouw alles zo dat de bron later Planyo wordt zonder de agenda te herbouwen (zie fase 6).
6. **Huisstijl**: kleuren en lettertypes uit `agenda.html` / `bwf-agenda-stijl.css` (Cormorant Garamond + Public Sans, groen `#14342A`, goud `#B9975B`). Nieuwe pagina's gebruiken `bwf-shell.js` en `bwf-account.js` voor login en menu.
7. Bij twijfel: **vraag Angela**, bouw geen aannames in.

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

**Eerste opdracht voor Claude Code (fase 0):** maak `docs/INVENTARIS.md` met per tabel de kolommen (`\d tabel`) en per pagina welke tabellen ze lezen/schrijven. Dan weten we zeker wat we samenvoegen.

---

## 2. Doel

Eén gedeelde agenda en één reserveringstabel in Supabase waar alle kanalen in samenkomen, zichtbaar per suite voor locatiemanagers, VR-assistent en eigenaar — met de juiste rechten, incheckformulieren, welkomstcalls, taken, voorraad, gastenregister en werkzaamhedenlog eraan gekoppeld.

**Kanalen**
| Kanaal | Levert | Betaling | Commissie | Uitbetaling |
|---|---|---|---|---|
| Privésauna (SMG) | volledige gastgegevens (bevestigingsmail), beschikbaarheid via ICS | bij aankomst of vooraf via SMG | 10% + servicekosten | de 7e van de volgende maand |
| Origineel Overnachten | alleen voor- en achternaam | via Mollie/PayPal-link, direct op Mollie | 10% via aparte factuur | direct |
| Booking.com | volledige gegevens in pdf/reserveringsmail | vooraf betaald aan Booking.com | 12–15% | na dag van aankomst |
| Eigen website / Planyo (vanaf okt) | alles | Mollie/iDEAL | 0% | direct |

---

## 3. Datamodel (Supabase)

### 3.1 `reserveringen` — de ene bron van waarheid
```sql
create table if not exists public.reserveringen (
  id                uuid primary key default gen_random_uuid(),
  suite             text not null check (suite in ('angie','malina_jacuzzi','malina_deluxe')),
  kanaal            text not null check (kanaal in ('smg','oo','booking','planyo','eigen','handmatig')),
  kanaal_ref        text,                 -- SMG-reserveringsnummer, Booking.com R-nummer, OO-nummer
  status            text not null default 'bevestigd', -- bevestigd | optie | geannuleerd | no_show
  type              text not null,        -- dagverblijf | overnachting | late_checkin | honeymoon
  aankomst          timestamptz not null,
  vertrek           timestamptz not null,
  incheck_tijd      time,                 -- afwijking t.o.v. standaard
  uitcheck_tijd     time,
  gast_voornaam     text,
  gast_achternaam   text,
  gast_email        text,
  gast_telefoon     text,
  gast_adres        text,
  personen          int default 2,
  arrangementen     jsonb default '[]',   -- [{naam, aantal, prijs}]
  extras            jsonb default '[]',
  omschrijving      text,
  -- geld
  bedrag_bruto      numeric,
  commissie_pct     numeric,
  commissie_bedrag  numeric,
  bedrag_netto      numeric generated always as (coalesce(bedrag_bruto,0) - coalesce(commissie_bedrag,0)) stored,
  betaald_via       text,                 -- kanaal | mollie | locatie | paypal
  betaalstatus      text default 'open',  -- open | deels | betaald
  restant_bedrag    numeric,
  uitbetaling_verwacht date,
  -- bronmateriaal
  brongegevens      text,                 -- geplakte/uitgelezen tekst uit pdf/mail/SMG
  bron_bestanden    jsonb default '[]',   -- paden in Supabase Storage bucket 'reservering-bijlagen'
  -- koppelingen
  klant_id          uuid references public.wz_klantbeheer(id),
  checkin_id        uuid,                 -- incheckformulier
  welkomstcall_id   uuid,
  nachtregister_id  uuid,
  -- beheer
  aangemaakt_door   text,
  gewijzigd_door    text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  unique (kanaal, kanaal_ref)
);
create index on public.reserveringen (suite, aankomst);
```
Migratie: bestaande `res_koppeling`/`checkins`-gegevens **niet** verwijderen maar via een migratiescript (`scripts/migreer-reserveringen.sql`) overzetten. Pas na controle door Angela de oude tabellen hernoemen naar `oud_*`.

### 3.2 `blokkades` — beschikbaarheid / gesloten
```sql
create table if not exists public.blokkades (
  id uuid primary key default gen_random_uuid(),
  suite text not null,
  van timestamptz not null,
  tot timestamptz not null,
  reden text,                 -- gesloten | onderhoud | eigen gebruik | ICS-import
  bron text default 'handmatig',
  created_at timestamptz default now()
);
```

### 3.3 `kanaal_instellingen`
Per kanaal: commissie-%, servicekosten, uitbetaalregel, standaard in-/uitchecktijden per type, ICS-URL (alleen leesbaar voor eigenaar). Vervangt losse constanten in de code.

Standaardtijden (te bevestigen door Angela):
| Type | Incheck | Uitcheck |
|---|---|---|
| Overnachting | 15:00 | 11:00 |
| Late check-in | 20:00 | 11:00 |
| Honeymoon | 01:00 | 11:00 |
| Dagverblijf | per boeking | per boeking |
| Laat uitchecken (+€50) | — | 12:00 |

### 3.4 `wz_medewerkers.rol` en RLS
Kolom `rol text check (rol in ('eigenaar','vr','locatiemanager'))` en per medewerker `suites text[]` (welke suites hij/zij mag zien). Row Level Security op `reserveringen`, `blokkades`, `wz_taken`, `checkins`, `voorraad`, `wz_werkzaamheden` volgens de matrix in §5.

### 3.5 `voorraad` en `voorraad_mutaties`
Artikel, locatie, aantal, minimum, bestellijst-vinkje; mutaties met wie/wanneer.

### 3.6 `wz_werkzaamheden` uitbreiden
Kolom `reservering_id` zodat elke gelogde taak van de VR-assistent aan een reservering hangt; maandoverzicht per medewerker × tarief → factuurbasis.

---

## 4. Fases

### Fase 0 — Inventaris en veiligheid (½ dag)
- [ ] `docs/INVENTARIS.md` (tabellen + kolommen + welke pagina wat gebruikt)
- [ ] `exports/` + `.gitignore`; volledige dump van Supabase
- [ ] Repo opschonen: `archief/`, `*.zip`, `files (5).zip`, map `~` en `*-test.html` beoordelen; verwijderen wat dubbel is (lijst eerst aan Angela laten zien)

### Fase 1 — Datamodel (1 dag)
- [ ] `supabase/migrations/2026xxxx_reserveringen.sql` met §3.1–3.6
- [ ] Migratiescript oude tabellen → `reserveringen`
- [ ] Storage bucket `reservering-bijlagen` (privé, alleen ingelogd)
- [ ] RLS-policies + testaccounts per rol

### Fase 2 — Import van de kanalen (1–2 dagen)
- [ ] Edge function `kanalen-sync` (Deno, elke 15 min via `pg_cron` of Make): haalt ICS van Privésauna, Booking.com en OO op, schrijft/updatet `reserveringen` op `(kanaal, kanaal_ref)`; verwijderde ICS-items → status `geannuleerd`
- [ ] Bestaande Make-scenario "Reserveringen SMG" (bevestigingsmails) laten schrijven naar `reserveringen` i.p.v. Planyo → verrijkt de ICS-rijen met gastgegevens
- [ ] Booking.com-mails (`@guest.booking.com`) via Make parsen: naam, e-mail, telefoon, prijs, commissie, R-nummer
- [ ] Commissie en `uitbetaling_verwacht` automatisch berekenen uit `kanaal_instellingen`
- [ ] `agenda-bridge` (Google Agenda) mag blijven als extra bron, maar wordt niet meer de basis

### Fase 3 — Agenda en dagoverzicht (1–2 dagen)
- [ ] `agenda.html` ombouwen naar `reserveringen` + `blokkades`: dag / week / maand, filter per suite, kleur per kanaal en status
- [ ] Onder de kalender een uitklaplijst met de reserveringen van de gekozen dag/periode
- [ ] Dagstart in `vr2.html` en startscherm `dashboard.html` (alleen Lelystad) laden dezelfde component (`bwf-kalender.js`) — één kalender, twee dashboards
- [ ] Knoppen: reservering openen, incheckformulier, welkomstcall, taak aanmaken
- [ ] Later: ICS-feed **uit** Supabase (`/functions/v1/agenda-ics?token=…`) zodat Apple/Google Agenda meelezen

### Fase 4 — Reservering, pdf/plakveld en formulieren (2 dagen)
- [ ] `reservering.html` (detail): gast, verblijf, geld, bronmateriaal, koppelingen, wijzigingslog
- [ ] Plak-/uploadveld: pdf (pdf.js), txt, Excel (SheetJS), foto (Tesseract.js of handmatig); tekst → `brongegevens`; velden voorvullen via herkenning (Booking.com-pdf, SMG-tekst, OO-bevestiging/Mollie-bon). Zelfde component in de welkomstcall
- [ ] Incheckformulieren-dropdown met drie staten: **klaargezet** (na welkomstcall), **nieuw/leeg**, **definitief**
- [ ] `incheckformulier.html`: openen, bewerken, opslaan, koppelen aan reservering; concept toewijzen aan locatiemanager; gastlink genereren
- [ ] Welkomstcall: reservering kiezen → extra's bijboeken → WhatsApp/e-mail → Mollie-link voor restant/extra's
- [ ] Automatisch klant aanmaken/samenvoegen in `wz_klantbeheer`; overnachting doorzetten naar nachtregister
- [ ] Bekende bugs meenemen: arrangementen/betaling niet opgeslagen, gastformulier leegt velden en handtekening, geen bedrag bij aanmaken

### Fase 5 — Rollen, taken, voorraad, werkzaamheden (1–2 dagen)
- [ ] Menu en knoppen per rol (matrix §5); alles wat niet mag is ook niet zichtbaar
- [ ] Taken: aanmaken, toewijzen, overdragen, afvinken, verwijderen (VR/eigenaar)
- [ ] Voorraadbeheer als pagina in beide dashboards
- [ ] Werkzaamhedenlog met `reservering_id`; maandoverzicht per medewerker → export voor factuur
- [ ] Externe knoppen: Gmail, Wati, SMG-dashboard, Booking.com extranet, OO, Planyo, Mollie — openen in nieuw tabblad (iframes worden door die sites geblokkeerd)

### Fase 6 — Overstapdag Planyo (begin oktober)
- [ ] `planyo-bridge` weer aanzetten; Planyo schrijft naar `reserveringen` met `kanaal='planyo'`
- [ ] Booking.com aan Planyo-XML, OO aan Planyo-ICS
- [ ] ICS-import van Privésauna uitzetten, historie blijft staan

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
2. Standaard in-/uitchecktijden per type (§3.3) kloppen?
3. ICS-URL's van Booking.com en Origineel Overnachten aanleveren (of staan ze in Make?)
4. Welke locatiemanager mag welke suite(s) zien — Lelystad = Malina Jacuzzi + Malina Deluxe, Almere = Angie?
5. Import elke 15 minuten: via Supabase `pg_cron` (geen Make nodig) of via Make (bestaand)?
6. Gmail in het dashboard: knop naar Gmail (nu) of later echte Gmail-API-koppeling (apart project)?

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
