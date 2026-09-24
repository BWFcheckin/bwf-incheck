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
function wanneer(
  aankomst: string,
  tijd: string | null,
  vertrek?: string | null,
  uitTijd?: string | null,
): string {
  const d = String(aankomst || "").slice(0, 10).split("-");
  if (d.length !== 3) return String(aankomst || "");
  const dagen = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
  const maanden = ["januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december"];
  const dt = new Date(Number(d[0]), Number(d[1]) - 1, Number(d[2]));
  const klok = String(tijd || String(aankomst).slice(11, 16) || "").slice(0, 5);
  let uit = dagen[dt.getDay()] + " " + Number(d[2]) + " " + maanden[Number(d[1]) - 1] +
    (klok && klok !== "00:00" ? " " + klok : "");

  /* Angela, 24-09-2026: "bij datum wil ik datum in en uitchecktijd." De
     uitcheck erachter, en de dag erbij als de gast pas een andere dag
     vertrekt - anders lijkt 11:00 een tijd op de aankomstdag. */
  const u = String(uitTijd || String(vertrek || "").slice(11, 16) || "").slice(0, 5);
  const vd = String(vertrek || "").slice(0, 10).split("-");
  if (u && u !== "00:00") {
    const zelfdeDag = vd.length === 3 && vd.join("-") === d.join("-");
    if (zelfdeDag) {
      uit += " tot " + u;
    } else if (vd.length === 3) {
      const vt = new Date(Number(vd[0]), Number(vd[1]) - 1, Number(vd[2]));
      uit += " tot " + dagen[vt.getDay()] + " " + Number(vd[2]) + " " + u;
    } else {
      uit += " tot " + u;
    }
  }
  return uit;
}

/* Wat er verder over de boeking te zeggen valt: dagverblijf of overnachting,
   met hoeveel personen, en wat erbij geboekt is.

   Angela, 24-09-2026: "dagverblijf of overnachting, aantal personen,
   arrangementen." Dit gaat mee in dezelfde vierde plek van het sjabloon waar
   eerst alleen het kanaal stond. Zo hoeft het sjabloon niet opnieuw langs
   Meta - dat duurde de vorige keer dagen - en staat er toch in wat je 's
   avonds wilt weten. */
function watVoorVerblijf(b: {
  aankomst?: string | null; vertrek?: string | null; type?: string | null;
}): string {
  const t = String(b.type || "").toLowerCase();
  if (t.includes("dag")) return "dagverblijf";
  if (t.includes("nacht") || t.includes("overnacht")) return "overnachting";
  /* Geen type ingevuld? Dan zegt het verschil tussen de datums het: vertrekt
     de gast op een andere dag, dan blijft hij slapen. */
  const a = String(b.aankomst || "").slice(0, 10);
  const v = String(b.vertrek || "").slice(0, 10);
  if (a && v && a !== v) return "overnachting";
  if (a && v && a === v) return "dagverblijf";
  return "";
}

function arrangementTekst(arr: unknown): string {
  if (!Array.isArray(arr)) return "";
  const namen: string[] = [];
  for (const a of arr) {
    const naam = typeof a === "string" ? a
      : (a && typeof a === "object" ? String((a as Record<string, unknown>).naam || "") : "");
    const n = naam.trim();
    if (!n || namen.includes(n)) continue;
    namen.push(n);
  }
  if (!namen.length) return "";
  /* Niet eindeloos lang: WhatsApp kapt een te lange regel af en dan valt juist
     het kanaal erachter weg. */
  const kort = namen.slice(0, 3).join(", ");
  return namen.length > 3 ? kort + " en nog " + (namen.length - 3) : kort;
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

  let meld: { aan?: boolean; nummers?: Record<string, string | string[]> } = {};
  try { meld = JSON.parse(inst?.waarde || "{}"); } catch { /* stond er raar in */ }

  if (!meld.aan) {
    return Response.json({ gedaan: 0, reden: "staat uit" });
  }
  const nummers = meld.nummers || {};

  /* Angela, 22-09-2026: "ik wil voor het whatsapp-pushbericht spoedboekingen
     extra telefoonnummers kunnen toevoegen." Een locatie had één nummer als
     tekst; dat mag nu ook een lijst zijn. Beide vormen blijven werken, want
     in de instellingen kan de oude vorm nog staan.

     Dubbele nummers gaan eruit: staat hetzelfde nummer twee keer in de lijst,
     dan krijgt die persoon anders twee keer hetzelfde bericht. */
  function nummersVan(plaats: string): string[] {
    const w = nummers[plaats];
    const ruw = Array.isArray(w) ? w : String(w || "").split(/[\n,;]+/);
    const uit: string[] = [];
    for (const x of ruw) {
      const n = watiNummer(String(x || "").trim());
      if (n && !uit.includes(n)) uit.push(n);
    }
    return uit;
  }

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
    const lijst = nummersVan(plaats);
    if (!lijst.length) {
      return Response.json({ test: plaats, reden: "geen nummer ingesteld" }, { status: 400 });
    }
    /* Naar allemaal, zodat je in één keer ziet welk nummer het wel doet en
       welk niet - dat was precies de vraag bij Almere. */
    const proeven = [];
    for (const nr of lijst) {
      const p = await stuurWati({ endpoint, token, sjabloon }, nr, [
        { name: "1", value: "Proefbericht (geen echte gast)" },
        { name: "2", value: wanneer(new Date(Date.now() + 18 * 3600_000).toISOString(), null) },
        { name: "3", value: plaats === "Almere" ? "Suite Angie" : "Malina Jacuzzi" },
        { name: "4", value: "een test vanuit het dashboard" },
      ]);
      proeven.push({ nummer: nr, gelukt: p.gelukt, http: p.http, antwoord: p.ruw });
    }
    const proef = proeven[0];
    return Response.json({
      test: plaats, naar: lijst, sjabloon, per_nummer: proeven,
      gelukt: proeven.every((x) => x.gelukt), http: proef.http, antwoord: proef.ruw,
    }, { status: proef.gelukt ? 200 : 502 });
  }

  // ---- 2. welke boekingen komen in aanmerking ----
  const nu = Date.now();
  const tot = new Date(nu + SPOED_UREN * 3600_000).toISOString();
  const vers = new Date(nu - VERS_UREN * 3600_000).toISOString();

  const { data: boekingen, error: leesFout } = await db.from("reserveringen")
    .select("id,suite,kanaal,kanaal_ref,aankomst,incheck_tijd,status," +
      "gast_voornaam,gast_achternaam,created_at," +
      /* erbij sinds 24-09-2026: nodig voor de uitchecktijd, het soort verblijf,
         het aantal personen en de arrangementen in het bericht */
      "vertrek,uitcheck_tijd,type,personen,arrangementen")
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
  /* Welke nummers deze melding al gekregen hebben, per reservering. Nodig nu
     een locatie meerdere nummers kan hebben: lukt het bij de één wel en bij de
     ander niet, dan wordt de melding opnieuw opgepakt en mag wie hem al heeft
     niet nog eens gebeld worden. */
  const eerderNummers = new Map<string, string>();
  if (ids.length) {
    const { data: al } = await db.from("meldingen_verstuurd")
      .select("reservering_id,gelukt,pogingen,nummer,locatie").eq("soort", SOORT).in("reservering_id", ids);
    for (const r of al || []) {
      pogingen.set(r.reservering_id, Number(r.pogingen) || 0);
      eerderNummers.set(r.reservering_id, String(r.nummer || ""));
      if (r.gelukt) { klaar.add(r.reservering_id); continue; }
      if ((Number(r.pogingen) || 0) < MAX_POGINGEN) continue;
      /* Opgegeven, maar staat er inmiddels een ander nummer voor die locatie?
         Dan is de reden om op te geven vervallen en proberen we het opnieuw.

         Dit kwam meteen aan het licht (21-09-2026): het nummer voor Almere
         bleek geen WhatsApp te hebben, dus de melding werd terecht opgegeven -
         maar zou Angela daar een mobiel nummer neerzetten, dan kwam die
         boeking nooit meer langs. "Ongeldig nummer" is alleen blijvend zolang
         het nummer hetzelfde blijft. */
      /* Staat er inmiddels een ander of een extra nummer voor die locatie?
         Dan is de reden om op te geven vervallen. Met meerdere nummers per
         locatie kijken we of er eentje bij is waar nog niets heen ging. */
      const nu = nummersVan(String(r.locatie || ""));
      const gedaan = String(r.nummer || "").split(",").filter(Boolean);
      if (nu.some((n) => !gedaan.includes(n))) { pogingen.set(r.reservering_id, 0); continue; }
      klaar.add(r.reservering_id);
    }
  }

  /* Angela, 24-09-2026: "de eerste spoedberichten waren dubbel verstuurd, 3
     keer ongeveer hetzelfde bericht."

     Per reservering gaat er hoogstens één melding uit - daar zorgt de unieke
     index op (reservering_id, soort) voor. Maar dezelfde boeking staat soms
     meer dan eens in de tabel: een privésauna-regel van SMG én de boeking
     eromheen, of een dubbele import. Dan is het voor de database netjes één
     melding per rij, en voor de ontvanger drie keer bijna hetzelfde bericht.

     Daarom hier een tweede zeef: dezelfde gast, dezelfde suite en dezelfde
     aankomstdag gaat één keer. Welke van de dubbele rijen dat wordt maakt niet
     uit; de andere worden weggelaten en krijgen een notitie waarom, zodat je
     het kunt terugzien in plaats van je af te vragen waar die melding bleef. */
  function zelfdeVerblijf(b: Record<string, unknown>): string {
    return [
      String(b.suite || ""),
      String(b.aankomst || "").slice(0, 10),
      [b.gast_voornaam, b.gast_achternaam].filter(Boolean).join(" ").trim().toLowerCase(),
    ].join("|");
  }

  const gezienVerblijf = new Set<string>();
  /* Wat al eerder verstuurd is telt mee: anders komt er bij een volgende ronde
     alsnog een tweede bericht voor de dubbele rij. */
  for (const b of boekingen || []) {
    if (klaar.has(b.id)) gezienVerblijf.add(zelfdeVerblijf(b));
  }

  const dubbel: Array<Record<string, unknown>> = [];
  const teDoen = (boekingen || []).filter((b) => {
    if (klaar.has(b.id)) return false;
    const sleutel = zelfdeVerblijf(b);
    if (gezienVerblijf.has(sleutel)) { dubbel.push({ id: b.id, overgeslagen: "zelfde verblijf" }); return false; }
    gezienVerblijf.add(sleutel);
    return true;
  }).slice(0, MAX_PER_RONDE);

  /* De overgeslagen dubbelen vastleggen als afgehandeld, zodat ze niet elke
     ronde opnieuw langskomen. */
  for (const d of dubbel) {
    await db.from("meldingen_verstuurd").upsert({
      reservering_id: d.id, soort: SOORT, locatie: null, nummer: null,
      gelukt: true, pogingen: 0,
      antwoord: "overgeslagen: dezelfde gast, suite en aankomstdag stond al in een andere reservering",
      verstuurd_op: new Date().toISOString(),
    }, { onConflict: "reservering_id,soort" });
  }

  // ---- 4. versturen ----
  const uit: Array<Record<string, unknown>> = [];
  for (const b of teDoen) {
    const plaats = locatieVan(b.suite);
    const lijst = nummersVan(plaats);

    const eerder = pogingen.get(b.id) || 0;

    // Vastleggen dat we hem gezien hebben, maar niet als afgehandeld. Is het
    // nummer nog niet ingevuld, dan kan dat elk moment gebeuren; de teller gaat
    // dan bewust niet omhoog, zodat de volgende ronde hem gewoon weer oppakt.
    // Een onbekende locatie verandert wél nooit meer: die geven we op.
    if (!plaats || !lijst.length) {
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
    const kanaalNaam = KANAAL_NAAM[String(b.kanaal || "")] || String(b.kanaal || "onbekend");
    /* Alles wat in de vierde plek van het sjabloon past, gescheiden door
       puntjes. Leeg wat er niet is: "onbekend · 0 personen" leest slechter dan
       alleen wat je wél weet. */
    const soort = watVoorVerblijf(b);
    const pers = Number(b.personen) > 0
      ? Number(b.personen) + (Number(b.personen) === 1 ? " persoon" : " personen") : "";
    const arrs = arrangementTekst(b.arrangementen);
    const via = [kanaalNaam, soort, pers, arrs].filter(Boolean).join(" \u00b7 ");

    // De variabelen moeten in dezelfde volgorde staan als {{1}} {{2}} {{3}} {{4}}
    // in het goedgekeurde sjabloon in Wati.
    const parameters = [
      { name: "1", value: naam },
      { name: "2", value: wanneer(b.aankomst, b.incheck_tijd, b.vertrek, b.uitcheck_tijd) },
      { name: "3", value: suiteKort(b.suite) },
      { name: "4", value: via },
    ];

    /* Naar elk nummer van deze locatie. Wie het bericht bij een eerdere ronde
       al gekregen heeft wordt overgeslagen: het veld nummer houdt bij waar het
       heen ging, met komma's ertussen. Zonder die controle zou een tweede
       poging - nodig omdat één van de nummers het niet deed - de anderen een
       dubbel bericht bezorgen. */
    const alGehad = String(eerderNummers.get(b.id) || "").split(",").filter(Boolean);
    const nogTeDoen = lijst.filter((n) => !alGehad.includes(n));

    const resultaten = [];
    for (const nr of nogTeDoen) {
      const p = await stuurWati({ endpoint, token, sjabloon }, nr, parameters);
      resultaten.push({ nummer: nr, ...p });
    }

    const gelukteNu = resultaten.filter((x) => x.gelukt).map((x) => x.nummer);
    const gelukteAlle = alGehad.concat(gelukteNu);
    /* Klaar is deze melding pas als iedereen op de lijst hem heeft. */
    const gelukt = lijst.every((n) => gelukteAlle.includes(n));
    /* Blijvend mislukt alleen als geen van de openstaande nummers nog kans
       maakt - anders blijven we het de volgende ronde proberen. */
    const blijvend = resultaten.length > 0 && resultaten.every((x) => x.gelukt || x.blijvend);
    const http = resultaten.length ? resultaten[resultaten.length - 1].http : 0;

    const staat = gelukt ? eerder : blijvend ? MAX_POGINGEN : eerder;

    await db.from("meldingen_verstuurd").upsert({
      reservering_id: b.id, soort: SOORT, locatie: plaats,
      nummer: gelukteAlle.join(","),
      gelukt, pogingen: staat,
      antwoord: resultaten.map((x) =>
        x.nummer + ": http " + x.http + " " + String(x.ruw || "").slice(0, 120)).join(" | "),
      verstuurd_op: new Date().toISOString(),
    }, { onConflict: "reservering_id,soort" });

    uit.push({
      id: b.id, locatie: plaats, gelukt, http,
      naar: nogTeDoen, gelukte: gelukteNu,
      ...(gelukt ? {} : { nogmaals: !blijvend }),
    });
  }

  return Response.json({
    bekeken: (boekingen || []).length,
    verstuurd: uit.filter((x) => x.gelukt).length,
    dubbel_overgeslagen: dubbel.length,
    regels: uit.concat(dubbel),
  });
});
