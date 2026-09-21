// Supabase Edge Function: whatsapp-spoed
//
// Stuurt een WhatsApp naar de locatie zodra er een boeking binnenkomt voor een
// gast die binnen 24 uur aankomt. Angela, 21-09-2026.
//
// Aangeroepen door pg_cron, elke vijf minuten. Bewust geen trigger op de tabel:
// de import van Booking.com en Origineel Overnachten schrijft in één keer
// tientallen rijen weg, en dan zou de import moeten wachten op een externe
// server en zouden er tientallen appjes tegelijk de deur uit gaan.
//
// Naar welk nummer het gaat stelt Angela zelf in op de dagstart van het
// VR-dashboard; dat staat in instellingen onder de sleutel spoed_meldingen:
//   {"aan": true, "nummers": {"Lelystad": "0612345678", "Almere": ""}}
// Een leeg nummer betekent: voor die locatie geen melding.
//
// Wat al verstuurd is staat in meldingen_verstuurd. Die tabel heeft een unieke
// index op (reservering_id, soort), dus dezelfde boeking kan niet twee keer
// langskomen - ook niet als twee rondes elkaar overlappen.
//
// Secrets (namen, geen waarden):
//   WATI_ENDPOINT  - staat in het Wati-dashboard onder API Docs. Inclusief het
//                    nummer erachter, zonder schuine streep op het eind, dus
//                    bijvoorbeeld https://live-mt-server.wati.io/123456
//   WATI_TOKEN     - het token van diezelfde pagina, zonder het woord "Bearer".
//                    Maak er liefst een aan onder Connector > API > Create API
//                    Token: het token op de API Docs-pagina verloopt zodra
//                    Angela haar Wati-wachtwoord wijzigt.
//   WATI_TEMPLATE  - naam van het goedgekeurde sjabloon. Standaard bwf_spoedboeking.
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// "Verify JWT" staat voor deze functie UIT: pg_cron stuurt geen JWT mee. De
// afscherming loopt via de header x-spoed-token. Dat token staat alleen in
// Vault; deze functie vraagt het op met bwf_spoed_token() en vergelijkt. Zo
// staat het geheim op één plek en niet ook nog eens als Edge-secret.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SOORT = "spoed_whatsapp";

// Hoeveel meldingen hoogstens per ronde. Een noodrem: gaat er ooit iets mis in
// de selectie, dan kost dat hoogstens tien appjes en niet honderd.
const MAX_PER_RONDE = 10;

// Hoe vaak een mislukte melding het opnieuw mag proberen. Daarna blijft hij
// met gelukt=false in meldingen_verstuurd staan en komt hij niet meer terug.
const MAX_POGINGEN = 5;

// Alleen boekingen die kort geleden zijn binnengekomen. Zonder deze grens zou
// de eerste ronde na het aanzetten alles van de afgelopen tijd versturen.
const VERS_UREN = 48;

// Hoe ver vooruit "spoed" reikt.
const SPOED_UREN = 24;

// De kolom suite kent maar drie waarden: 'angie', 'malina_jacuzzi' en
// 'malina_deluxe' (check-constraint in 20260911120000_fase1_structuur.sql).
// De losse regels eronder zijn een vangnet voor het geval er ooit een andere
// schrijfwijze binnenkomt; een lege uitkomst betekent "weet ik niet" en dan
// gaat er bewust geen appje de deur uit.
function locatieVan(suite: string): string {
  const s = String(suite || "").toLowerCase().replace(/[^a-z]/g, "");
  if (s === "angie") return "Almere";
  if (s === "malinajacuzzi" || s === "malinadeluxe") return "Lelystad";
  if (/psa|angie|almere/.test(s)) return "Almere";
  if (/psmd|psd|deluxe|zwembad|psm|jacuzzi|malina/.test(s)) return "Lelystad";
  return "";
}

function suiteKort(suite: string): string {
  const s = String(suite || "").toLowerCase().replace(/[^a-z]/g, "");
  if (s === "angie") return "Suite Angie";
  if (s === "malinajacuzzi") return "Malina Jacuzzi";
  if (s === "malinadeluxe") return "Malina Deluxe";
  if (/psmd|psd|deluxe|zwembad/.test(s)) return "Malina Deluxe";
  if (/psm|jacuzzi|malina/.test(s)) return "Malina Jacuzzi";
  if (/psa|angie|almere/.test(s)) return "Suite Angie";
  return String(suite || "de suite");
}

// 0612345678 of +31 6 12345678 -> 31612345678. Wati wil het zonder plus.
function watiNummer(ruw: string): string {
  let n = String(ruw || "").replace(/[^\d+]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  else if (n.startsWith("00")) n = n.slice(2);
  else if (n.startsWith("0")) n = "31" + n.slice(1);
  return n;
}

// "2026-09-22T15:00:00" -> "maandag 22 september om 15:00"
function wanneer(aankomst: string, tijd: string | null): string {
  const d = String(aankomst || "").slice(0, 10).split("-");
  if (d.length !== 3) return String(aankomst || "");
  const dagen = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
  const maanden = ["januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december"];
  const dt = new Date(Number(d[0]), Number(d[1]) - 1, Number(d[2]));
  const klok = String(tijd || String(aankomst).slice(11, 16) || "").slice(0, 5);
  return dagen[dt.getDay()] + " " + Number(d[2]) + " " + maanden[Number(d[1]) - 1] +
    (klok && klok !== "00:00" ? " om " + klok : "");
}

// Dezelfde namen als WC_KANAAL_NAAM in vr2.html; de kolom kanaal kent alleen
// deze zes waarden (check-constraint in 20260911120000_fase1_structuur.sql).
const KANAAL_NAAM: Record<string, string> = {
  smg: "SMG",
  booking: "Booking.com",
  oo: "Origineel Overnachten",
  planyo: "Planyo",
  eigen: "Eigen website",
  handmatig: "Handmatig",
};

// Twee tekenreeksen vergelijken zonder dat de tijd verraadt hoeveel tekens er
// klopten. Overdreven voor een taak die alleen vanuit de database komt, maar
// het kost drie regels.
function zelfde(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let uit = 0;
  for (let i = 0; i < a.length; i++) uit |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return uit === 0;
}

type Wati = { endpoint: string; token: string; sjabloon: string };
type Param = { name: string; value: string };

/* Eén sjabloonbericht naar één nummer. Wati kan http 200 teruggeven met
   result:false erin, dus allebei nakijken. En een 200 betekent "aangenomen
   door Wati", nog niet "bij de ontvanger"; dat laatste weet je alleen via hun
   webhooks, en die hebben we niet. */
async function stuurWati(w: Wati, nummer: string, parameters: Param[]) {
  let http = 0, ruw = "", gelukt = false;
  try {
    const r = await fetch(
      w.endpoint + "/api/v1/sendTemplateMessage?whatsappNumber=" + encodeURIComponent(nummer),
      {
        method: "POST",
        headers: { Authorization: "Bearer " + w.token, "Content-Type": "application/json" },
        body: JSON.stringify({
          template_name: w.sjabloon,
          broadcast_name: "bwf_spoed_" + Date.now(),
          parameters,
        }),
      },
    );
    http = r.status;
    ruw = (await r.text()).slice(0, 800);
    let body: { result?: boolean; info?: string } | null = null;
    try { body = JSON.parse(ruw); } catch { /* geen json */ }
    gelukt = r.ok && body?.result === true;
  } catch (e) {
    ruw = "netwerkfout: " + String(e).slice(0, 300);
  }
  return { http, ruw, gelukt, blijvend: blijvendeFout(ruw) };
}

/* Heeft opnieuw proberen nog zin?

   Dit onderscheid is belangrijk. Toen het sjabloon nog bij Meta lag ter
   goedkeuring, antwoordde Wati met "Template is not approved." Zou dat als
   gewone mislukking tellen, dan was een echte boeking na vijf rondes - een
   half uur - voorgoed opgegeven, terwijl Meta er soms een dag over doet. Die
   melding was dan nooit verstuurd en niemand had het gemerkt.

   Dus: alleen een fout die niet vanzelf overgaat telt als definitief. Een
   nummer zonder WhatsApp verandert niet, en een sjabloon dat niet bestaat ook
   niet. Wachten op goedkeuring, een storing bij Wati of een vol quotum gaan
   wel vanzelf over; die blijven we proberen zolang de gast nog moet komen. */
function blijvendeFout(ruw: string): boolean {
  const s = ruw.toLowerCase();
  if (/"validwhatsappnumber"\s*:\s*false/.test(s)) return true;
  if (/template.*(not found|does not exist|doesn't exist)/.test(s)) return true;
  return false;
}

Deno.serve(async (req) => {
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Komt deze aanroep echt van de taak in de database?
  const meegestuurd = req.headers.get("x-spoed-token") || "";
  const { data: verwacht } = await db.rpc("bwf_spoed_token");
  if (!verwacht || !meegestuurd || !zelfde(meegestuurd, String(verwacht))) {
    return new Response("nee", { status: 401 });
  }

  // ---- 1. wat heeft Angela ingesteld ----
  const { data: inst } = await db.from("instellingen")
    .select("waarde").eq("sleutel", "spoed_meldingen").maybeSingle();

  let meld: { aan?: boolean; nummers?: Record<string, string> } = {};
  try { meld = JSON.parse(inst?.waarde || "{}"); } catch { /* stond er raar in */ }

  if (!meld.aan) {
    return Response.json({ gedaan: 0, reden: "staat uit" });
  }
  const nummers = meld.nummers || {};

  const endpoint = (Deno.env.get("WATI_ENDPOINT") || "").replace(/\/+$/, "");
  const token = Deno.env.get("WATI_TOKEN") || "";
  const sjabloon = Deno.env.get("WATI_TEMPLATE") || "bwf_spoedboeking";
  if (!endpoint || !token) {
    return Response.json({ gedaan: 0, reden: "wati nog niet ingesteld" }, { status: 503 });
  }

  // ---- proefbericht ----
  // Met ?test=lelystad of ?test=almere gaat er één bericht met voorbeeldgegevens
  // naar dat nummer, zonder de boekingen langs te gaan en zonder iets in
  // meldingen_verstuurd te schrijven. Zo kun je nakijken of het sjabloon is
  // goedgekeurd en of het nummer WhatsApp heeft, zonder op een echte
  // spoedboeking te hoeven wachten. Het token is hiervoor nodig, dus dit kan
  // niet zomaar door een vreemde worden afgevuurd.
  const test = new URL(req.url).searchParams.get("test");
  if (test) {
    const plaats = test.toLowerCase() === "almere" ? "Almere" : "Lelystad";
    const nummer = watiNummer(nummers[plaats] || "");
    if (!nummer) {
      return Response.json({ test: plaats, reden: "geen nummer ingesteld" }, { status: 400 });
    }
    const proef = await stuurWati({ endpoint, token, sjabloon }, nummer, [
      { name: "1", value: "Proefbericht (geen echte gast)" },
      { name: "2", value: wanneer(new Date(Date.now() + 18 * 3600_000).toISOString(), null) },
      { name: "3", value: plaats === "Almere" ? "Suite Angie" : "Malina Jacuzzi" },
      { name: "4", value: "een test vanuit het dashboard" },
    ]);
    return Response.json({
      test: plaats, naar: nummer, sjabloon,
      gelukt: proef.gelukt, http: proef.http, antwoord: proef.ruw,
    }, { status: proef.gelukt ? 200 : 502 });
  }

  // ---- 2. welke boekingen komen in aanmerking ----
  const nu = Date.now();
  const tot = new Date(nu + SPOED_UREN * 3600_000).toISOString();
  const vers = new Date(nu - VERS_UREN * 3600_000).toISOString();

  const { data: boekingen, error: leesFout } = await db.from("reserveringen")
    .select("id,suite,kanaal,kanaal_ref,aankomst,incheck_tijd,status," +
      "gast_voornaam,gast_achternaam,created_at")
    .neq("status", "geannuleerd")
    .gte("aankomst", new Date(nu).toISOString())
    .lte("aankomst", tot)
    .gte("created_at", vers)
    .order("created_at", { ascending: false })
    .limit(100);

  if (leesFout) {
    return Response.json({ fout: leesFout.message }, { status: 500 });
  }

  // ---- 3. wat is al gemeld ----
  // Alleen een geslaagde melding telt als afgehandeld. Een mislukte poging
  // mag het opnieuw proberen: het nummer kan alsnog ingevuld zijn en Wati kan
  // er even uit hebben gelegen. Wel met een teller erbij, anders komt een
  // boeking met een fout in het sjabloon elke vijf minuten terug.
  const ids = (boekingen || []).map((b) => b.id);
  const klaar = new Set<string>();
  const pogingen = new Map<string, number>();
  if (ids.length) {
    const { data: al } = await db.from("meldingen_verstuurd")
      .select("reservering_id,gelukt,pogingen,nummer,locatie").eq("soort", SOORT).in("reservering_id", ids);
    for (const r of al || []) {
      pogingen.set(r.reservering_id, Number(r.pogingen) || 0);
      if (r.gelukt) { klaar.add(r.reservering_id); continue; }
      if ((Number(r.pogingen) || 0) < MAX_POGINGEN) continue;
      /* Opgegeven, maar staat er inmiddels een ander nummer voor die locatie?
         Dan is de reden om op te geven vervallen en proberen we het opnieuw.

         Dit kwam meteen aan het licht (21-09-2026): het nummer voor Almere
         bleek geen WhatsApp te hebben, dus de melding werd terecht opgegeven -
         maar zou Angela daar een mobiel nummer neerzetten, dan kwam die
         boeking nooit meer langs. "Ongeldig nummer" is alleen blijvend zolang
         het nummer hetzelfde blijft. */
      const nu = watiNummer((nummers[String(r.locatie || "")] || ""));
      if (nu && nu !== String(r.nummer || "")) { pogingen.set(r.reservering_id, 0); continue; }
      klaar.add(r.reservering_id);
    }
  }

  const teDoen = (boekingen || []).filter((b) => !klaar.has(b.id)).slice(0, MAX_PER_RONDE);

  // ---- 4. versturen ----
  const uit: Array<Record<string, unknown>> = [];
  for (const b of teDoen) {
    const plaats = locatieVan(b.suite);
    const nummer = watiNummer(nummers[plaats] || "");

    const eerder = pogingen.get(b.id) || 0;

    // Vastleggen dat we hem gezien hebben, maar niet als afgehandeld. Is het
    // nummer nog niet ingevuld, dan kan dat elk moment gebeuren; de teller gaat
    // dan bewust niet omhoog, zodat de volgende ronde hem gewoon weer oppakt.
    // Een onbekende locatie verandert wél nooit meer: die geven we op.
    if (!plaats || !nummer) {
      await db.from("meldingen_verstuurd").upsert({
        reservering_id: b.id, soort: SOORT, locatie: plaats || null,
        nummer: null, gelukt: false, pogingen: plaats ? eerder : MAX_POGINGEN,
        antwoord: plaats ? "geen nummer ingesteld voor " + plaats : "locatie onbekend",
        verstuurd_op: new Date().toISOString(),
      }, { onConflict: "reservering_id,soort" });
      uit.push({ id: b.id, overgeslagen: plaats ? "geen nummer" : "locatie onbekend" });
      continue;
    }

    const naam = [b.gast_voornaam, b.gast_achternaam].filter(Boolean).join(" ") || "zonder naam";
    const via = KANAAL_NAAM[String(b.kanaal || "")] || String(b.kanaal || "onbekend");

    // De variabelen moeten in dezelfde volgorde staan als {{1}} {{2}} {{3}} {{4}}
    // in het goedgekeurde sjabloon in Wati.
    const parameters = [
      { name: "1", value: naam },
      { name: "2", value: wanneer(b.aankomst, b.incheck_tijd) },
      { name: "3", value: suiteKort(b.suite) },
      { name: "4", value: via },
    ];

    const { http, ruw, gelukt, blijvend } = await stuurWati(
      { endpoint, token, sjabloon }, nummer, parameters);

    // Gelukt: klaar. Blijvende fout: meteen opgeven, want herhalen helpt niet
    // en in antwoord staat waarom. Tijdelijk (wachten op goedkeuring, storing):
    // de teller niet ophogen, zodat we blijven proberen tot de gast er is.
    const staat = gelukt ? eerder : blijvend ? MAX_POGINGEN : eerder;

    await db.from("meldingen_verstuurd").upsert({
      reservering_id: b.id, soort: SOORT, locatie: plaats, nummer,
      gelukt, pogingen: staat, antwoord: "http " + http + " " + ruw,
      verstuurd_op: new Date().toISOString(),
    }, { onConflict: "reservering_id,soort" });

    uit.push({
      id: b.id, locatie: plaats, gelukt, http,
      ...(gelukt ? {} : { nogmaals: !blijvend }),
    });
  }

  return Response.json({
    bekeken: (boekingen || []).length,
    verstuurd: uit.filter((x) => x.gelukt).length,
    regels: uit,
  });
});
