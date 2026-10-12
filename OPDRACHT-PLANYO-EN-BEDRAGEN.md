# Opdracht: Planyo koppelen + volledige bedragen in het dashboard

Lees dit hele bestand voordat je begint. Lees daarna eerst:
PLAN-AGENDA-EN-RESERVERINGEN.md, supabase/functions/kanalen-sync,
supabase/functions/planyo-bridge en de migraties rond kanalen_verwerk
(o.a. 20260911140000_fase2_handmatig_behouden.sql en
20261005140000_import_annuleert_geen_betaalde_boeking.sql).

## Gouden regels (gelden voor ALLES hieronder)

1. Bestaande reserveringen in `reserveringen` worden NOOIT overschreven,
   verwijderd of dubbel ingevoerd.
2. Een import vult een veld alleen als het leeg is én de reservering niet
   handmatig is gewijzigd (`handmatig_gewijzigd_op` is leeg). Wat ik of een
   medewerker heeft ingevuld, blijft altijd staan.
3. Nooit rijen verwijderen. Annuleren = alleen de status van een door de
   import aangemaakte rij aanpassen, en nooit stil een betaalde boeking
   annuleren (bestaande regel van 05-10-2026 blijft gelden).
4. Bij twijfel (zelfde suite + datum + overlappende tijd, ander nummer):
   niets schrijven, loggen als conflict en aan mij melden.
5. Elke stap eerst als proefrun met overzicht (nieuw / bestaat al /
   aangevuld / conflict). Pas na mijn akkoord wegschrijven.
6. Vraag bevestiging vóór elke deploy, migratie of het instellen van
   secrets. Geen geheimen of sleutels in de code of in GitHub.
7. Geen Make.com.

## Stap 0 – Veiligheid

- Maak een CSV-back-up van de volledige tabel `reserveringen` in de map
  `backups/` (zet `backups/` in .gitignore) en meld het aantal rijen.
- Voeg alleen nieuwe kolommen toe waar nodig (bijv. `planyo_id`,
  `servicekosten`, `arrangementen_tekst`, `bedrag_bron`). Wijzig of
  verwijder geen bestaande kolommen of data.

## Stap 1 – Planyo als bron in de bestaande route

- Voeg Planyo (site ID 70822, secret PLANYO_API_KEY) toe als bron met
  kanaal 'planyo' in de bestaande kanalen-sync-route, verwerkt door
  `kanalen_verwerk`, zodat alle bestaande beschermingsregels ook voor
  Planyo gelden.
- Sla in Planyo de blokken over die uit de Privésauna-ICS-import komen
  (die staan al via de SMG-feed in het dashboard).
- Herken Booking.com-boekingen die via de Planyo-XML binnenkomen en geef
  ze kanaal 'booking' (met het Booking-reserveringsnummer), zodat ze niet
  dubbel staan naast eerder geïmporteerde Booking-regels.
- Optioneel: een Planyo notification callback (beveiligd met token) die
  dezelfde verwerking direct start, naast de 15-minutencron.

## Stap 2 – Bedragen per kanaal

Doel: per reservering totaal, betaald en nog te betalen. Altijd het bedrag
dat de GAST betaalt, inclusief servicekosten, zonder aftrek van commissie.

A. Privésauna (SMG) – uit de e-mails (de ICS-feed bevat geen bedragen)
   - Bron: mails van privesaunanl@mg.specialmoments.group, onderwerpen
     "Verhuur-oke? #nummer" en "Bevestiging #nummer". Daarin staat een blok
     "Betaaloverzicht": Basisprijs, Arrangementen, Subtotaal,
     Servicekosten, Totaal, Betaald, Te betalen, plus de lijst
     arrangementen (bijv. "×1 Verjaardags arrangement (€ 75,00)").
   - Bouw een Edge Function `smg-mail` (beveiligd met token) die de
     mailtekst ontvangt, het reserveringsnummer zoekt in `reserveringen`
     (kanaal smg, kanaal_ref) en vult:
       bedrag_totaal  = Totaal (INCLUSIEF servicekosten)
       betaald_bedrag = Betaald
       restant_bedrag = Te betalen
       servicekosten  = Servicekosten
       arrangementen_tekst = de lijst arrangementen
     Bestaat het nummer niet: geen reservering aanmaken, alleen loggen.
     Bij een nieuwere mail voor hetzelfde nummer met andere bedragen:
     alleen bijwerken als het veld nog door de import zelf gevuld was,
     anders als conflict melden.
   - Schrijf een Google Apps Script voor mijn Google-account
     (info@bedenwellnessflevoland.nl) dat elke 10 minuten nieuwe SMG-mails
     naar `smg-mail` stuurt en ze daarna label "SMG-verwerkt" geeft.
     Leg stap voor stap uit hoe ik het installeer.
   - Eenmalig: alle oude SMG-mails verwerken voor bestaande reserveringen,
     eerst als proefrun met overzicht.

B. Planyo / eigen website
   - total_price → bedrag_totaal, amount_paid → betaald_bedrag,
     restant_bedrag = totaal − betaald.

C. Booking.com (via Planyo)
   - Het bedrag dat de gast betaalt (vóór commissie) → bedrag_totaal.
     Booking-boekingen zijn vooraf betaald: betaald_bedrag = totaal,
     restant_bedrag = 0, betaald_via = 'Booking.com'.
   - Controleer bij de eerste echte boeking of Planyo het brutobedrag
     doorgeeft en meld het mij als het een nettobedrag blijkt te zijn.

D. Origineel Overnachten
   - De ICS-feed geeft alleen datums en een naam. Onderzoek of de
     boekingsmails van boeking@origineelovernachten.nl bedragen en
     contactgegevens bevatten. Zo ja: zelfde aanpak als bij A (eigen
     functie of uitbreiding van het Apps Script), met dezelfde regels.
     Laat mij eerst zien wat er in zo'n mail staat.

## Stap 3 – Overstap per kanaal

- Leg uit hoe ik in `kanaal_instellingen` de Booking.com- en OO-feed op
  actief=false zet op de dag dat ik die kanalen aan Planyo koppel.
- De SMG-feed blijft actief (ik blijf op Privésauna).
- Zorg dat de oude Make-scenario's niet meer nodig zijn en zeg welke ik
  mag uitzetten.

## Stap 4 – Dashboards gelijktrekken

- dashboard.html toont Planyo daarna niet meer apart via planyo-bridge;
  dashboard.html en vr2.html tonen exact dezelfde reserveringen uit
  `reserveringen`.
- Toon in het reserveringsdetail: Totaal (incl. servicekosten),
  Betaald, Nog te betalen, servicekosten en de arrangementen.

## Stap 5 – Reserveren vanuit het dashboard (dashboard → Planyo)

Huidige situatie (gecontroleerd 12-10-2026): een nieuwe reservering in
reserveringen.html wordt alleen in Supabase opgeslagen en komt NIET in
Planyo. `planyo-bridge` heeft al `create-reservation`,
`update-reservation` en `create-block`, en bwf-planyo.js heeft
`createReservation`/`updateReservation`/`createBlock`, maar geen pagina
gebruikt ze. bwf-kalender.js heeft de optie `vrijeBlokken` ("Nog vrij op
deze dag"), maar die staat uit en is niet klikbaar.

A. Beschikbare tijdsblokken tonen en aanklikken
   - Zet in de agenda van reserveringen.html, dashboard.html en vr2.html
     per dag en per suite de nog vrije tijdsblokken aan (bestaande optie
     vrijeBlokken), met prijs uit de tarieven.
   - Vrij = niet bezet door een reservering of blokkade in `reserveringen`,
     niet bezet in Planyo (live controleren), en rekening houdend met de
     schoonmaakbuffer van 1,5 uur (bij bruidsnacht tot uitchecktijd + 1,5
     uur).
   - Klikken op een vrij blok opent het formulier "Nieuwe reservering"
     met suite, datum, tijdsblok, type en prijs al ingevuld.

B. Reservering vanuit het dashboard naar Planyo
   - Bij opslaan van een nieuwe reservering: eerst opnieuw controleren of
     het blok nog vrij is (Planyo + `reserveringen`). Daarna aanmaken in
     Planyo via create-reservation (juiste resource-ID, tijden, gast,
     custom_price = het bedrag uit het formulier), en pas daarna opslaan
     in `reserveringen` met kanaal 'eigen'/'telefonisch'/'whatsapp' zoals
     gekozen en het `planyo_id` erbij, zodat de Planyo-import hem herkent
     en NIET dubbel invoert.
   - Mislukt Planyo: de reservering niet stil alleen in Supabase opslaan.
     Duidelijke melding tonen, met de keuze "toch opslaan, markeren als
     NIET in Planyo" (zichtbaar rood label + taak om het na te lopen).
   - Als beheerder (eigenaar) mag ik de schoonmaakbuffer overschrijven;
     andere rollen niet.
   - Wijzigen van datum/tijd/suite en annuleren in het dashboard ook naar
     Planyo doorzetten (update-reservation), alleen voor reserveringen
     met een planyo_id.
   - Een suite sluiten of een periode blokkeren vanuit het dashboard gaat
     via create-block naar Planyo.
   - Zo blokkeert Planyo automatisch de website, Booking.com (XML) en
     Origineel Overnachten (Planyo-ICS). Privésauna blokkeer ik zelf met
     de hand: maak daarvoor bij elke reservering die niet via Privésauna
     binnenkwam een taak "Blokkeren in Privésauna" voor de VR-assistent.
   - Kanaal 'smg'-reserveringen nooit naar Planyo sturen als reservering:
     die komen al via de privésauna-ICS-import in Planyo.

## Stap 6 – Controle en verslag

- Maak na afloop een overzicht per kanaal (SMG, Planyo/website,
  Booking.com, OO): aantal toekomstige reserveringen, hoeveel met
  bedragen, hoeveel zonder, en alle conflicten.
- Werk PLAN-AGENDA-EN-RESERVERINGEN.md bij met wat er gebouwd is.
