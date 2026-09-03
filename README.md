# Administratie Michel

Administratiepagina van Bed & Wellness Flevoland met twee tabbladen:

- **Boekingen BWF 2026** — boekingen per suite (PSA, PSM, PSMD) met omzet, wat er op locatie is afgerekend en de vergoeding voor Michel. Plus facturen en uitbetalingen, een openstaand saldo en per maand een vinkje "maand betaald". Een boeking kun je inlezen door de pdf of tekst van een incheckformulier erin te slepen.
- **Rittenregistratie MBThere B.V.** — taxidiensten uit de Cabman-dienstenrapportage: dienstnummer, chauffeur, kenteken, begin en einde dienst, aantal ritten, totaalbedrag, contant, op rekening, pin, diensttijd, start- en eind-km, dashboard-km, totale, beladen en onbeladen kilometers. Een nieuwe rapportage sleep je erin als excel, csv of pdf.

Beide tabbladen kun je per maand of over het hele jaar als CSV downloaden.

## 1. Supabase klaarzetten

1. Open het Supabase-project (of maak een nieuw project aan).
2. Ga naar **SQL Editor → New query**, plak de inhoud van `supabase-setup.sql` en klik op **Run**.
3. Ga naar **Authentication → Users → Add user → Create new user** en maak het account aan:
   - E-mailadres: `michelretz@hotmail.com`
   - Wachtwoord: zelf kiezen, minimaal 8 tekens
   - Zet **Auto Confirm User** aan, anders kan er niet worden ingelogd
4. Maak op dezelfde manier een account voor Angela aan, zodat jullie beiden kunnen inloggen.

Werk je in een **nieuw** Supabase-project? Zoek dan in `administratie-michel.html` bovenaan naar `SUPABASE_URL` en `SUPABASE_ANON_KEY` en vervang die twee regels door de waarden uit **Project Settings → API** (Project URL en de publishable/anon key).

## 2. Op GitHub zetten

De repository is `BWFcheckin/administratie-mbthere` (public — nodig voor GitHub Pages).

1. Upload `index.html`, `supabase-setup.sql` en dit README-bestand naar de repository.
2. Ga naar **Settings → Pages** en kies bij Source: **Deploy from a branch**, branch `main`, map `/ (root)`. Opslaan.
3. Na een paar minuten staat de pagina online op:
   `https://bwfcheckin.github.io/administratie-mbthere/`

Let op de kleine letters in de link: GitHub Pages maakt onderscheid tussen grote en kleine letters.

De pagina bevat alleen de publieke anon-key. Alle gegevens zitten achter het inloggen, want de tabel staat op row level security: zonder account krijg je niets te zien.

## 3. De eerste keer vullen

Log in en neem de bestaande gegevens over:

- Tabblad **Boekingen BWF 2026** → onderaan bij *Gegevens uit het Excel-bestand overnemen*: 324 boekingen (april 2025 t/m augustus 2026) en 10 facturen/uitbetalingen.
- Tabblad **Rittenregistratie** → bovenaan bij *Diensten inlezen uit Cabman*: 329 diensten uit de dienstenrapportage 2026.

Dat hoef je maar één keer te doen; daarna staat alles in Supabase en zie je op elk apparaat hetzelfde. Regels die er al in staan worden overgeslagen, dus twee keer klikken kan geen kwaad.

## Aandachtspunten

- Bij de facturen 10001 t/m 10005 stond in de Excel geen betaaldatum. Die staan op de 1e van de maand met een opmerking erbij — even nalopen. Facturen 10006 en 10007 uit het tabblad "PSA 2025 Temp." zijn niet overgenomen.
- De vergoeding bij een ingelezen incheckformulier is een schatting: € 60 bij een dagverblijf, € 130 bij een overnachting. Altijd zelf controleren.
- Pdf's en excel-bestanden inlezen vraagt internet: de lezer wordt op dat moment opgehaald. Een gescande pdf zonder tekstlaag kan niet worden gelezen.
- De naam boven de pagina verander je in `administratie-michel.html` bij `var NAAM`.
