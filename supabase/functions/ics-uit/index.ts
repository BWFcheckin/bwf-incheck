// Supabase Edge Function: ics-uit
// ---------------------------------------------------------------------------
// Angela, 29-09-2026: "alles wordt nu handmatig gedaan" - als er ergens een
// boeking binnenkomt, blokkeert zij met de hand de agenda's van de andere
// kanalen. Eén vergeten blokkade is een dubbele boeking.
//
// Deze functie geeft per suite een agendafeed uit met alles wat bezet is.
// Die zet je in Booking.com, Privésauna (SMG) en Origineel Overnachten; die
// halen hem elke paar uur op en sluiten die dagen dan zelf af.
//
// DAARMEE IS DE CIRKEL ROND:
//   kanalen-sync  leest de feeds van de kanalen  -> boekingen binnen
//   ics-uit       geeft onze eigen feed uit      -> kanalen blokkeren zichzelf
//
// WAT ER NIET IN STAAT, en dat is met opzet:
// Geen namen, geen e-mailadressen, geen bedragen. Alleen dát een periode
// bezet is. Deze feed is voor een deel van de kanalen alleen met een adres
// bereikbaar, en zo'n adres belandt vroeg of laat in een browserhistorie of
// een supportticket. Dan mogen er geen gastgegevens in staan.
//
// BEVEILIGING
// De feed is opzettelijk NIET achter een inlog: Booking.com kan niet inloggen.
// In plaats daarvan zit er een token in het adres, dat als omgevingsvariabele
// staat (ICS_UIT_TOKEN) en dus nooit in de repo. Zonder of met een verkeerd
// token komt er 404 - niet 401, want dat zou verraden dat er iets te halen
// valt op dat adres.
//
// Deze functie moet worden uitgerold ZONDER JWT-controle, anders kunnen de
// kanalen er niet bij:
//     supabase functions deploy ics-uit --no-verify-jwt

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  (() => {
    /* Nieuwere projecten zetten de sleutels als JSON in SUPABASE_SECRET_KEYS.
       Zelfde aanpak als in kanalen-sync, zodat beide functies werken op een
       project van voor én na die omzetting. */
    try {
      const j = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
      return j.default ?? Object.values(j)[0] ?? "";
    } catch {
      return "";
    }
  })();
const TOKEN = Deno.env.get("ICS_UIT_TOKEN") ?? "";

/* De suites zoals ze in de database heten, met de naam die in de agenda van
   het kanaal komt te staan. */
const SUITES: Record<string, string> = {
  angie: "Suite Angie",
  malina_jacuzzi: "Malina Jacuzzi",
  malina_deluxe: "Malina Deluxe",
};

/* Hoe ver terug we kijken. Verleden hoeft niet: een kanaal blokkeert daar
   niets meer mee, en het maakt de feed alleen groter. Een maand marge voor
   boekingen die net zijn begonnen. */
const DAGEN_TERUG = 31;

/* Vergelijken zonder te verraden waar het verschil zit. Bij een gewone
   ===-vergelijking kan iemand uit de responstijd afleiden hoeveel tekens
   kloppen; dat is bij een token van deze lengte theoretisch, maar het kost
   niets om het goed te doen. */
function zelfdeToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let uit = 0;
  for (let i = 0; i < a.length; i++) uit |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return uit === 0;
}

function niksHier(): Response {
  /* Geen 401 en geen uitleg: wie het adres niet heeft, hoort niet te weten
     dat hier iets te halen valt. */
  return new Response("Not found", { status: 404 });
}

async function rest(pad: string): Promise<unknown[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${pad}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Accept: "application/json",
    },
  });
  if (!r.ok) throw new Error(`database gaf ${r.status}`);
  return await r.json();
}

/* ---------- agendabestand opbouwen ---------- */

/* iCal wil tekst zonder losse komma's, puntkomma's en regelovergangen. */
function ical(s: string): string {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/* Een regel mag niet langer dan 75 tekens; langere worden gevouwen met een
   spatie aan het begin van de volgende regel. Mailservers en kalenders zijn
   daar streng in. */
function vouw(regel: string): string {
  if (regel.length <= 73) return regel;
  const stukken: string[] = [];
  let rest = regel;
  stukken.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest.length > 72) {
    stukken.push(" " + rest.slice(0, 72));
    rest = rest.slice(72);
  }
  if (rest) stukken.push(" " + rest);
  return stukken.join("\r\n");
}

const alsDatum = (iso: string): string =>
  String(iso ?? "").slice(0, 10).replace(/-/g, "");

/* Een dag erbij. Nodig omdat DTEND bij hele dagen EXCLUSIEF is: een
   overnachting van 28 op 29 september loopt in iCal van 20260928 tot
   20260929, en een dagverblijf op 29 september van 20260929 tot 20260930.
   Zonder die dag erbij zou een dagverblijf nul dagen duren en blokkeert het
   kanaal niets. */
function dagErbij(jjjjmmdd: string): string {
  const j = Number(jjjjmmdd.slice(0, 4));
  const m = Number(jjjjmmdd.slice(4, 6));
  const d = Number(jjjjmmdd.slice(6, 8));
  const dt = new Date(Date.UTC(j, m - 1, d + 1));
  return dt.toISOString().slice(0, 10).replace(/-/g, "");
}

function nuStempel(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

type Blok = { begin: string; eind: string; uid: string; wat: string };

function maakIcs(suiteNaam: string, blokken: Blok[]): string {
  const regels: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bed en Wellness Flevoland//Beschikbaarheid//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${ical(suiteNaam)} - bezet`,
    "X-WR-TIMEZONE:Europe/Amsterdam",
  ];
  const stempel = nuStempel();
  for (const b of blokken) {
    regels.push(
      "BEGIN:VEVENT",
      `UID:${b.uid}`,
      `DTSTAMP:${stempel}`,
      `DTSTART;VALUE=DATE:${b.begin}`,
      `DTEND;VALUE=DATE:${b.eind}`,
      /* Alleen dát het bezet is. Zie de kop van dit bestand: geen namen. */
      `SUMMARY:${ical(b.wat)}`,
      "TRANSP:OPAQUE",
      "STATUS:CONFIRMED",
      "END:VEVENT",
    );
  }
  regels.push("END:VCALENDAR");
  return regels.map(vouw).join("\r\n") + "\r\n";
}

/* ---------- de functie zelf ---------- */

Deno.serve(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "HEAD") return niksHier();

  const url = new URL(req.url);
  const suite = (url.searchParams.get("suite") ?? "").trim();
  const token = (url.searchParams.get("token") ?? "").trim();

  /* Zonder ingesteld token doet deze functie helemaal niets. Anders zou een
     vergeten omgevingsvariabele de feed voor iedereen openzetten. */
  if (!TOKEN || !token || !zelfdeToken(token, TOKEN)) return niksHier();
  if (!SUITES[suite]) return niksHier();

  const grens = new Date(Date.now() - DAGEN_TERUG * 86400000)
    .toISOString().slice(0, 10);

  try {
    /* Reserveringen die de suite bezet houden. Geannuleerd en no-show tellen
       niet: die dagen zijn weer vrij. Een optie WEL: die houdt de suite vast
       tot hij vervalt, en een dubbele boeking daarop is precies wat we
       willen voorkomen. */
    const res = (await rest(
      "reserveringen?select=id,aankomst,vertrek,status" +
        `&suite=eq.${encodeURIComponent(suite)}` +
        `&vertrek=gte.${grens}` +
        "&status=in.(bevestigd,optie)" +
        "&geannuleerd_op=is.null" +
        "&order=aankomst.asc&limit=2000",
    )) as Array<Record<string, string>>;

    /* Blokkades uit de kanalen en handmatige sluitingen. Die staan in een
       eigen tabel en moeten mee: anders zou een suite die om onderhoud dicht
       is, bij de kanalen weer vrij lijken. */
    let blk: Array<Record<string, string>> = [];
    try {
      blk = (await rest(
        "blokkades?select=id,van,tot,reden" +
          `&suite=eq.${encodeURIComponent(suite)}` +
          `&tot=gte.${grens}` +
          "&order=van.asc&limit=2000",
      )) as Array<Record<string, string>>;
    } catch {
      /* Bestaat die tabel niet of mag hij niet gelezen worden, dan gaat de
         feed door met alleen de reserveringen. Een feed zonder blokkades is
         beter dan helemaal geen feed. */
      blk = [];
    }

    const blokken: Blok[] = [];

    for (const r of res) {
      const begin = alsDatum(r.aankomst);
      if (!begin) continue;
      let eind = alsDatum(r.vertrek) || begin;
      /* Een dagverblijf begint en eindigt op dezelfde dag; in iCal is DTEND
         exclusief, dus zonder een dag erbij duurt het evenement nul dagen en
         blokkeert het kanaal niets. */
      if (eind <= begin) eind = dagErbij(begin);
      blokken.push({
        begin,
        eind,
        uid: `res-${r.id}@bedenwellnessflevoland.nl`,
        wat: r.status === "optie" ? "Optie" : "Bezet",
      });
    }

    for (const b of blk) {
      const begin = alsDatum(b.van);
      if (!begin) continue;
      let eind = alsDatum(b.tot) || begin;
      if (eind <= begin) eind = dagErbij(begin);
      blokken.push({
        begin,
        eind,
        uid: `blk-${b.id}@bedenwellnessflevoland.nl`,
        /* De reden kan "onderhoud" zijn maar ook een gastnaam uit een
           kanaalimport. Daarom altijd hetzelfde woord, nooit de reden zelf. */
        wat: "Niet beschikbaar",
      });
    }

    const body = maakIcs(SUITES[suite], blokken);
    return new Response(req.method === "HEAD" ? null : body, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="${suite}.ics"`,
        /* Een kwartier cache: de kanalen halen hooguit een paar keer per dag
           op, en zo vangen we een kanaal op dat te vaak vraagt. */
        "Cache-Control": "public, max-age=900",
        /* Geen zoekmachines, mocht het adres ooit ergens opduiken. */
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (e) {
    /* Nooit de fout zelf teruggeven: daar kunnen namen van tabellen of
       kolommen in staan. In het log mag het wel. */
    console.error("ics-uit:", e instanceof Error ? e.message : e);
    return new Response("Tijdelijk niet beschikbaar", { status: 503 });
  }
});
