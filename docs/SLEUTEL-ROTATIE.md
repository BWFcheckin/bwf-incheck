# Agendasleutel vervangen (Google Apps Script → Supabase)

Opgesteld 11-09-2026. Aanleiding: de sleutel en URL van de Google Apps Script-agendaproxy stonden open in publieke HTML-bestanden (zie `docs/INVENTARIS.md` §1.2). Iedereen die de repo bekijkt kan daarmee de agenda met gastnamen opvragen. Dit document legt uit hoe je een nieuwe sleutel maakt en waar die komt.

## Hoe het na deze wijziging werkt

```
pagina (ingelogd)  ──►  bwf-agenda.js  ──►  Supabase Edge Function agenda-bridge  ──►  Google Apps Script  ──►  Google Agenda
                         (geen sleutel)       controleert de login, voegt           controleert de sleutel
                                              AGENDA_PROXY_KEY toe als ?k=
```

- De sleutel staat **alleen** in twee plekken: in het Apps Script-project en in het Supabase-secret `AGENDA_PROXY_KEY`.
- De web-app-URL staat alleen in het Supabase-secret `AGENDA_PROXY_URL`.
- In de HTML staat **niets** meer. De pagina's `dashboard.html`, `dagoverzicht.html` en `incheckformulier.html` (en de oude kopieën `incheckformulier-test.html`, `vandaag-test.html`, `archief/dashboard-test.html`) halen de agenda nu via `bwf-agenda.js`, net als `vandaag.html` al deed.
- Gevolg: de agenda laadt alleen voor iemand die met een Supabase-account is ingelogd.

## Volgorde

Doe het in deze volgorde, dan is de agenda hooguit een paar minuten weg:

1. **Eerst de HTML-wijzigingen online zetten** (commit + push). Die werken nog met de oude sleutel, want `agenda-bridge` gebruikt het secret en dat is nu nog de oude waarde. Controleer daarna dat de agenda in `dashboard.html`, `dagoverzicht.html` en `incheckformulier.html` gewoon laadt.
2. Nieuwe sleutel maken (stap A).
3. Sleutel in Apps Script vervangen (stap B).
4. **Direct daarna** het Supabase-secret aanpassen (stap C).
5. Testen (stap D).

## A. Een nieuwe sleutel maken

Open Terminal op de Mac en voer uit:

```
openssl rand -hex 32
```

Je krijgt een lange reeks van 64 tekens (cijfers en a–f). Dat is de nieuwe sleutel. Kopieer hem naar een tijdelijke notitie; na stap C mag die notitie weg. Zet hem **niet** in een bestand in de repo.

## B. De sleutel vervangen in Google Apps Script

1. Ga naar **https://script.google.com** en log in met het Google-account waarvan de agenda wordt gelezen.
2. Open het project van de agendaproxy. Herkennen: in de code staat een functie `doGet(e)` die `e.parameter.k` vergelijkt met een sleutel en de agenda als JSON teruggeeft (met o.a. `events`, `opgehaald`, `fouten`).
3. Zoek in de code de regel waar de sleutel staat, bijvoorbeeld:
   ```js
   var SLEUTEL = 'oude-sleutel-hier';
   ```
4. **Aanbevolen: haal de sleutel uit de code** en zet hem in de scripteigenschappen. Dan hoeft de code bij een volgende wissel niet meer aangepast te worden.
   1. Klik links op het tandwiel **Projectinstellingen**.
   2. Scroll naar **Scripteigenschappen** → **Scripteigenschap toevoegen**.
   3. Eigenschap: `SLEUTEL` · Waarde: de nieuwe sleutel uit stap A → **Scripteigenschappen opslaan**.
   4. Ga terug naar **Editor** en vervang de regel uit punt 3 door:
      ```js
      var SLEUTEL = PropertiesService.getScriptProperties().getProperty('SLEUTEL');
      ```
   5. Controleer dat de vergelijking in `doGet` die variabele gebruikt, bijvoorbeeld `if (e.parameter.k !== SLEUTEL) { … fout … }`.
   6. Klik op **Opslaan** (schijfje).

   *Wil je de code niet aanpassen?* Vervang dan alleen de oude waarde in de regel uit punt 3 door de nieuwe sleutel en sla op.
5. **Nieuwe versie implementeren** — anders blijft de web-app de oude code gebruiken:
   1. Rechtsboven **Implementeren** → **Implementaties beheren**.
   2. Kies de bestaande web-app-implementatie → potlood (**Bewerken**).
   3. Bij **Versie**: kies **Nieuwe versie** → **Implementeren**.
   4. De web-app-URL (eindigt op `/exec`) blijft hetzelfde. Je hoeft `AGENDA_PROXY_URL` dus niet te wijzigen.

   Heb je in punt 4 alleen de scripteigenschap gewijzigd en de code al eerder zo ingericht, dan is een nieuwe versie niet nodig: eigenschappen gelden direct.

**Optioneel, extra veilig:** omdat ook de URL openbaar is geweest, kun je een **nieuwe implementatie** maken (Implementeren → Nieuwe implementatie → Web-app) en de oude implementatie **archiveren**. Je krijgt dan een nieuwe `/exec`-URL; die moet in stap C ook in `AGENDA_PROXY_URL`. Nodig is dit niet: zonder de juiste sleutel geeft de oude URL niets prijs.

## C. De sleutel in Supabase zetten

Via het dashboard (aanbevolen, dan komt de sleutel niet in je Terminal-geschiedenis):

1. Ga naar **https://supabase.com/dashboard/project/iuyjvtlauktnjprbmbjj/functions/secrets** (Edge Functions → Secrets).
2. Zoek `AGENDA_PROXY_KEY` → wijzig de waarde naar de nieuwe sleutel → opslaan.
3. Alleen als je in stap B een nieuwe implementatie hebt gemaakt: wijzig ook `AGENDA_PROXY_URL` naar de nieuwe `/exec`-URL.

De functie `agenda-bridge` hoeft niet opnieuw gedeployed te worden; nieuwe aanvragen gebruiken meteen de nieuwe waarde.

Via Terminal kan ook, maar dan staat de sleutel in je shell-geschiedenis:
```
supabase secrets set AGENDA_PROXY_KEY=<nieuwe sleutel> --project-ref iuyjvtlauktnjprbmbjj
```

Controle (toont alleen een hash, niet de waarde): `supabase secrets list`. De hash achter `AGENDA_PROXY_KEY` moet veranderd zijn.

## D. Testen

1. Open `https://bwfcheckin.github.io/bwf-incheck/vandaag.html` en log in → de agenda-afspraken verschijnen.
2. Idem `dashboard.html`, `dagoverzicht.html` en `incheckformulier.html` (bij het koppelen van een reservering staat "… uit de agenda").
3. Werkt het niet: Supabase → Edge Functions → `agenda-bridge` → **Logs**. Melding *"De achterliggende agenda antwoordde met status …"* of een `fout` uit Apps Script betekent meestal dat de sleutel in Apps Script en in Supabase niet gelijk is (spatie mee gekopieerd?).
4. Controleer dat de **oude** sleutel niet meer werkt: open in een privévenster de oude web-app-URL met `?k=` en de oude sleutel. Je moet een foutmelding krijgen in plaats van afspraken.

## Wat daarna nog in de repo staat

- De oude sleutel blijft zichtbaar in de **git-historie** en in `bwf-incheck-main-test.zip` / oude kopieën. Na stap B–C is die waardeloos; de historie herschrijven is niet nodig.
- Nieuwe code mag **nooit** meer rechtstreeks `script.google.com/macros/…` aanroepen; altijd via `bwf-agenda.js`.
