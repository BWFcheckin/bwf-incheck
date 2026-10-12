# SMG-mails naar het dashboard — installeren

De mails "Verhuur-oke? #nummer" en "Bevestiging #nummer" van Privésauna bevatten de bedragen die
de agenda-feed niet geeft. Een Google Apps Script in het Google-account van
Bed & Wellness Flevoland stuurt die mails elke 10 minuten naar de Supabase-functie `smg-mail`.
Die zet Totaal, Betaald, Te betalen, servicekosten en de arrangementen bij de reservering met
hetzelfde nummer. Er wordt nooit een reservering aangemaakt; wat met de hand is ingevuld blijft staan.

Geen Make.com. De sleutel staat nergens in de code of in GitHub.

## Eenmalig: de sleutel en de functie (op de Mac, in Claude Code of Terminal)

1. **Sleutel maken en in Supabase zetten.** Deze regel maakt een willekeurige sleutel, zet hem als
   secret `SMG_MAIL_TOKEN` in Supabase en kopieert hem naar het klembord (hij komt niet in beeld):

   ```
   T=$(openssl rand -hex 24); supabase secrets set SMG_MAIL_TOKEN=$T --project-ref iuyjvtlauktnjprbmbjj && printf %s "$T" | pbcopy && echo "Sleutel staat op het klembord"
   ```

2. **De functie deployen** (zonder inlogcontrole: de functie controleert zelf de sleutel):

   ```
   supabase functions deploy smg-mail --project-ref iuyjvtlauktnjprbmbjj --use-api --no-verify-jwt
   ```

## Het script in Google zetten

1. Log in bij Google als het account waar de SMG-mails binnenkomen — sinds eind september 2026 is
   dat het reserveringen-adres; de mails van vóór 27 september staan in het info-adres — en ga naar
   <https://script.google.com> → **Nieuw project**. Noem het "BWF SMG-mails".
2. Verwijder de voorbeeldcode en plak de volledige inhoud van `docs/apps-script/smg-mail.gs`.
   Klik op het diskje (Opslaan).
3. Links: tandwiel **Projectinstellingen** → onderaan **Scripteigenschappen** →
   **Scripteigenschap toevoegen**. Naam: `SMG_MAIL_TOKEN`. Waarde: plak de sleutel van het klembord
   (Cmd+V). Opslaan.
4. Terug naar de **Editor**. Kies bovenaan in het keuzelijstje de functie `proefrunOudeMails` en
   klik **Uitvoeren**. Google vraagt de eerste keer om toestemming (Gmail lezen en labelen,
   een Google Sheet maken, verbinding met een externe dienst): kies je account → **Geavanceerd** →
   **Ga naar BWF SMG-mails** → **Toestaan**.
5. De proefrun schrijft niets in het dashboard. Onderaan in het **Uitvoeringslogboek** staat de link
   naar een Google Sheet met per mail: nummer, uitkomst, de bedragen uit de mail en wat er nu in het
   dashboard staat. Stopt hij met "Tijd op", start `proefrunOudeMails` dan opnieuw: hij gaat verder
   waar hij was.
6. **Pas na akkoord op de proefrun:** voer `verwerkOudeMails` uit (zelfde manier; opnieuw starten
   tot er "Klaar" staat) en daarna één keer `zetTriggerAan`. Vanaf dan loopt het elke 10 minuten.

## Uitkomsten in het overzicht

| Uitkomst | Betekenis |
|---|---|
| aangevuld | Bedragen (of alleen servicekosten/arrangementen) ingevuld. |
| bijgewerkt | Nieuwere mail met andere bedragen, en de eerdere bedragen kwamen van deze import. |
| ongewijzigd | De bedragen stonden er al en kloppen met de mail. |
| handmatig | De reservering is met de hand gewijzigd: de import vult niets aan. |
| conflict | In het dashboard staat een ander totaal dan in de mail. Niets geschreven: nalopen. |
| onbekend_nummer | Geen SMG-reservering met dit nummer. Er wordt niets aangemaakt. |
| ouder | Er is al een nieuwere mail voor dit nummer verwerkt. |
| onleesbaar | Nummer of bedragen niet gevonden in de mail. |
| overgeslagen | Geen Verhuur-oke of Bevestiging, of niet van Special Moments Group. |

Alles wat echt verwerkt is staat in de tabel `smg_mail_log`.

## Uitzetten

Apps Script → links **Triggers** (wekkertje) → de trigger van `verwerkNieuweSmgMails` verwijderen.

## Twee mailboxen

De trigger hoort in het account waar de mails nu binnenkomen (het reserveringen-adres). Voor de
oude mails van vóór 27 september 2026 zet je hetzelfde script ook in het info-account, met dezelfde
sleutel, en draai je daar alleen `proefrunOudeMails` en daarna `verwerkOudeMails` — geen trigger.
