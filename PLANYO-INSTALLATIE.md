# Planyo koppelen aan het BWF-dashboard

De website bevat nu een Planyo-agenda en een beveiligde aansluiting voor het klantenbestand. De Planyo API-sleutel komt **niet** in GitHub of in de browser terecht.

## Eenmalig activeren

1. Open het bestaande Supabase-project `iuyjvtlauktnjprbmbjj`.
2. Plaats de map `supabase/functions/planyo-bridge` als Edge Function met de naam `planyo-bridge`.
3. Stel bij de secrets van deze functie `PLANYO_API_KEY` in. Gebruik hiervoor de API-sleutel uit Planyo.
4. Controleer dat `SUPABASE_URL` en `SUPABASE_ANON_KEY` voor de functie beschikbaar zijn.
5. Publiceer de Edge Function en daarna de bijgewerkte website.

Na het inloggen haalt de agenda automatisch reserveringen uit Planyo op. Zonder geldige dashboardsessie geeft de functie geen gastgegevens terug.

De agenda voegt deze gegevens samen met de bestaande gezamenlijke agenda. Daardoor blijven reserveringen van Booking.com, Privésauna, Origineel Overnachten en andere reeds gekoppelde kanalen zichtbaar. Boekingen met hetzelfde reserveringsnummer worden maar één keer getoond.

## Wat al klaarstaat

- Reserveringen ophalen voor de agenda, inclusief paginering.
- Naam, contactgegevens, suite, verblijf, prijs, betaling en status normaliseren.
- Klanten uit Planyo ophalen via `BWFPlanyo.customers(pagina)`.
- Automatisch verversen zonder de API-sleutel openbaar te maken.

Het daadwerkelijk samenvoegen van Planyo-klanten met bestaande klanten in `wz_klantbeheer` kan als volgende stap worden toegevoegd nadat de eerste live gegevens zijn gecontroleerd.
