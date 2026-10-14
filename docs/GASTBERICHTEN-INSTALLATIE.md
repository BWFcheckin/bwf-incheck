# Gastberichten van Booking.com in het dashboard — installeren

Als een gast via Booking.com iets vraagt of meldt ("Kan ik om 15:00 inchecken?", "2 year
anniversary"), stuurt Booking.com dat alleen als e-mail, vanaf een adres dat eindigt op
`@guest.booking.com`. Een Google Apps Script stuurt die mails elke 5 minuten naar de
Supabase-functie `gastberichten-mail`. Die zet het bericht in de tabel `gast_berichten` en koppelt
het aan de juiste reservering.

In het dashboard zie je dan:

- op de **reserveringskaart** in de agenda (vr2, locatiedashboard, Command Center, agenda,
  dagoverzicht, reserveringen) een blauw vlaggetje **✉ 1 open gastbericht** met het bericht
  eronder, een knop **Beantwoorden** (opent het gesprek in de Booking.com Extranet) en een knop
  **Afgehandeld**;
- in **vr2** een eigen tabblad **Gastberichten** met teller, en in **index.html** onder
  **Berichten** hetzelfde overzicht. Daar staan ook berichten die niet automatisch aan een
  reservering gekoppeld konden worden.

Aan de reserveringen zelf verandert niets: alleen de nieuwe tabel wordt gevuld. Geen Make.com.
De sleutel staat nergens in de code of in GitHub.

## Eenmalig: database, sleutel en functie (op de Mac, in Claude Code of Terminal, in ~/bwf-incheck)

1. **Migratie uitvoeren** (maakt de tabel `gast_berichten` en drie functies; verandert niets aan
   bestaande tabellen): Supabase → **SQL Editor** → **New query** → plak de volledige inhoud van
   `supabase/migrations/20261013210000_gastberichten.sql` → **Run**.

   (Liever niet `supabase db push`: dat voert ook andere migraties uit die nog klaarstaan.)

2. **Sleutel maken en in Supabase zetten.** Deze regel maakt een willekeurige sleutel, zet hem als
   secret `GASTBERICHTEN_TOKEN` en kopieert hem naar het klembord (hij komt niet in beeld):

   ```
   T=$(openssl rand -hex 24); supabase secrets set GASTBERICHTEN_TOKEN=$T --project-ref iuyjvtlauktnjprbmbjj && printf %s "$T" | pbcopy && echo "Sleutel staat op het klembord"
   ```

3. **De functie deployen** (zonder inlogcontrole: de functie controleert zelf de sleutel):

   ```
   supabase functions deploy gastberichten-mail --project-ref iuyjvtlauktnjprbmbjj --use-api --no-verify-jwt
   ```

## Het script in Google zetten

De Booking.com-gastberichten gaan naar facturen@angiesenterprises.nl en komen binnen in de Gmail
van **info@bedenwellnessflevoland.nl** (gezien 13-10-2026). Zet het script daar.

1. Log in bij Google als info@bedenwellnessflevoland.nl en ga naar <https://script.google.com> →
   **Nieuw project**. Noem het "BWF Gastberichten".
2. Verwijder de voorbeeldcode en plak de volledige inhoud van `docs/apps-script/gastberichten.gs`.
   Klik op het diskje (Opslaan).
3. Links: tandwiel **Projectinstellingen** → onderaan **Scripteigenschappen** →
   **Scripteigenschap toevoegen**. Naam: `GASTBERICHTEN_TOKEN`. Waarde: plak de sleutel van het
   klembord (Cmd+V). Opslaan.
4. Terug naar de **Editor**. Kies bovenaan de functie `proefrun` en klik **Uitvoeren**. Google
   vraagt de eerste keer om toestemming (Gmail lezen en labelen, verbinding met een externe
   dienst): kies je account → **Geavanceerd** → **Ga naar BWF Gastberichten** → **Toestaan**.
5. De proefrun schrijft niets. In het **Uitvoeringslogboek** staat per bericht: boekingsnummer,
   uitkomst (`gekoppeld` / `niet_gekoppeld`), hoe hij gekoppeld is, suite, aankomstdag en soort.
6. Ziet dat er goed uit: voer `verwerkRecent` uit (zet de berichten van de laatste 30 dagen in het
   dashboard) en daarna één keer `zetTriggerAan`. Vanaf dan loopt het elke 5 minuten.

## Hoe een bericht aan een reservering wordt gekoppeld

1. Op het Booking.com-nummer (staat in de mail en in het afzenderadres).
2. Lukt dat niet — een regel uit de Booking-agenda houdt soms zijn eigen nummer — dan op dezelfde
   suite + aankomstdag + naam van de gast.
3. Nog niet: op suite + aankomstdag, alleen als er precies één Booking-regel zonder naam is.

Past er niet precies één reservering, dan blijft het bericht ongekoppeld en staat het met een
oranje streep in het overzicht. Bij elke volgende verwerking wordt het opnieuw geprobeerd; komt de
reservering later binnen, dan koppelt het alsnog.

## Wie ziet wat

Dezelfde regel als bij de reserveringen: eigenaar en VR-assistent zien alles, een locatiemanager
alleen de berichten van zijn eigen suites. Een bericht zonder suite zien alleen eigenaar en VR.
Iedereen die een bericht ziet, mag het afvinken (en weer open zetten).

## Tip: gastberichten niet meer op het facturenadres

In de Booking.com Extranet kun je bij de contactgegevens instellen naar welk adres gastberichten
gaan. Kies je daar reserveringen@, zet dit script dan ook in dat Google-account (stap "Het script
in Google zetten", met dezelfde sleutel). Dubbel verwerken kan niet: elke mail telt maar één keer.

## Uitzetten / terugdraaien

- Uitzetten: Apps Script → links **Triggers** (wekkertje) → de trigger van
  `verwerkNieuweGastberichten` verwijderen.
- Helemaal terugdraaien: `supabase/rollback/20261013210000_gastberichten_terug.sql`. Het dashboard
  blijft dan gewoon werken; het vak Gastberichten meldt dat de koppeling niet is geïnstalleerd.

## Testen

```
node --experimental-strip-types tests/gastberichten-lees.test.mjs
```
