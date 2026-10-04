#!/usr/bin/env node
/*
 * Prijstest Planyo — vraagt ALLEEN prijzen en boekbaarheid op.
 *
 * Er wordt niets geboekt of gewijzigd: planyo-api.js laat alleen leesmethodes
 * toe. De sleutel komt uit .env (PLANYO_API_KEY) en wordt nergens getoond.
 *
 * Draaien:  node tests/planyo-prijzen.js
 * Uitkomst: tabel in de terminal + tests/planyo-prijzen-resultaat.md
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { planyo, zonderSleutel, keuzes, euro } = require("./planyo-api");

const SITE = "70822";
const DAY = "251803"; // B&W Angie Wellness - Day Stay
const OVN = "252021"; // B&W Angie Wellness - Overnight
const RESULTAAT = path.join(__dirname, "planyo-prijzen-resultaat.md");

const DI = "2026-11-10", DO = "2026-11-12", ZA = "2026-11-14", MA = "2026-11-16";

/* ---------- formulieropties ---------- */

const SOORT = { 1: "keuzelijst", 2: "tekst", 3: "aanvinkvak", 10: "aantal" };
// Velden die voor de prijs niets doen; die laten we uit het overzicht.
const OVERSLAAN = ["SMG_Boekingsnummer", "Algemene_Voorwaarden", "Voucher", "Giftcard"];

function overzichtRegels(resource) {
  const info = resource.info;
  const regels = [];
  regels.push("Resource " + resource.id + " — " + info.name);
  if (info.is_overnight_stay) {
    regels.push("  Per nacht, " + info.min_rental_time / 24 + " t/m " + info.max_rental_time / 24 + " nachten");
  } else {
    regels.push("  Starttijden: " + (info.start_times || "vrij") + " | duur " + info.min_rental_time + " t/m " + info.max_rental_time + " uur | basisprijs € " + info.unit_price);
  }
  for (const veld of resource.velden) {
    if (OVERSLAAN.indexOf(veld.name) >= 0) continue;
    let waarde = SOORT[veld.type] || "type " + veld.type;
    if (keuzes(veld).length) waarde += ": " + keuzes(veld).join(" | ");
    if (veld.default_value) waarde += "  (standaard: " + veld.default_value + ")";
    regels.push("  - " + veld.label.replace(/\s+/g, " ").trim() + " [" + veld.name + "] — " + waarde);
  }
  return regels;
}

/* ---------- testgevallen ---------- */

/*
 * Elke optie is [veldnaam, gewenste waarde]. Bij een keuzelijst volstaat het
 * begin van de keuze ("13:00"), zodat een aangepaste toelichting erachter de
 * test niet breekt. Bestaat het veld of de keuze niet: ONTBREEKT.
 */
const dag = (datum, uren) => ({ resource: DAY, datum: datum, uren: uren });
const nacht = (van, tot) => ({ resource: OVN, van: van, tot: tot });
const BRUIDSNACHT = [["Inchecktijd", "01:00"], ["Honeymoon_overnachting", "yes"]];

const GEVALLEN = [
  { nr: 1, tekst: "Day Stay 3 uur, 2 personen", verwacht: 249, ...dag(DI, 3), opties: [["adults", "2"]] },
  { nr: 2, tekst: "Day Stay 4 uur, 3 volw. + 1 kind (5 jr)", verwacht: 354, ...dag(DI, 4), opties: [["adults", "3"], ["Kinderen__2_12_jaar", "1"]] },
  { nr: 3, tekst: "Day Stay 3 uur, 4 volw. + lunch voor 4", verwacht: 447, ...dag(DI, 3), opties: [["adults", "4"], ["Lunch", "Standaard"], ["Lunch___aantal_personen", "4 personen"]] },
  { nr: 4, tekst: "Day Stay 3 uur, 4 volw. + verjaardagsarrangement", verwacht: 454, ...dag(DI, 3), opties: [["adults", "4"], ["Verjaardag_arrangement", "yes"]] },
  { nr: 5, tekst: "Overnight di, check-in 20:00, 2 pers.", verwacht: 399, ...nacht(DI, "2026-11-11"), opties: [["Inchecktijd", "20:00"], ["adults", "2"]] },
  { nr: 6, tekst: "Overnight za, check-in 20:00, 2 pers.", verwacht: 449, ...nacht(ZA, "2026-11-15"), opties: [["Inchecktijd", "20:00"], ["adults", "2"]] },
  { nr: 7, tekst: "Overnight do, check-in 13:00 (weekendtarief)", verwacht: 529, ...nacht(DO, "2026-11-13"), opties: [["Inchecktijd", "13:00"]] },
  { nr: 8, tekst: "Overnight ma, check-in 13:00 + uitchecken 12:00", verwacht: 499, ...nacht(MA, "2026-11-17"), opties: [["Inchecktijd", "13:00"], ["Uitchecktijd", "12:00"]] },
  { nr: 9, tekst: "Overnight za 20:00, 3 volwassenen", verwacht: 549, ...nacht(ZA, "2026-11-15"), opties: [["Inchecktijd", "20:00"], ["adults", "3"]] },
  { nr: 10, tekst: "Overnight di 20:00, 2 volw. + baby (1 jr)", verwacht: 399, ...nacht(DI, "2026-11-11"), opties: [["Inchecktijd", "20:00"], ["adults", "2"], ["Baby_s_en_peuters_0_1_jaar", "1"]] },
  { nr: 11, tekst: "Overnight Bruidsnacht za, check-in 01:00", verwacht: 849, ...nacht(ZA, "2026-11-15"), opties: BRUIDSNACHT },
  { nr: 12, tekst: "Overnight Bruidsnacht di: mag NIET boekbaar zijn", verwacht: null, nietBoekbaar: true, ...nacht(DI, "2026-11-11"), opties: BRUIDSNACHT },
  { nr: 13, tekst: "Overnight di 20:00 + 3 burgermenu's + 2 prosecco", verwacht: 576, ...nacht(DI, "2026-11-11"), opties: [["Inchecktijd", "20:00"], ["Burgermenu", "Black angus beef"], ["Burgermenu___aantal_personen", "3"], ["Wijn_of_prosecco", "Prosecco"], ["Wijn_of_prosecco___aantal_flessen", "2"]] },
  { nr: 14, tekst: "Overnight za 20:00 + VIP-arrangement", verwacht: 699, ...nacht(ZA, "2026-11-15"), opties: [["Inchecktijd", "20:00"], ["VIP_Arrangement", "yes"]] },
  { nr: 15, tekst: "Overnight 7 nachten ma 16-11 t/m ma 23-11, 20:00, 2 pers.", verwacht: 2843.35, ...nacht(MA, "2026-11-23"), opties: [["Inchecktijd", "20:00"], ["adults", "2"]] }
];

// Zet de opties om naar rental_prop_-parameters; geeft terug wat ontbreekt.
function instellen(geval, resource) {
  const params = { resource_id: resource.id, quantity: "1" };
  const ontbreekt = [];

  if (geval.uren) {
    const info = resource.info;
    const start = String(info.start_times || "12:00").split(",")[0].trim();
    if (geval.uren < Number(info.min_rental_time) || geval.uren > Number(info.max_rental_time)) {
      ontbreekt.push("duur " + geval.uren + " uur");
    }
    const eindUur = Number(start.split(":")[0]) + geval.uren;
    params.start_time = geval.datum + " " + start;
    params.end_time = geval.datum + " " + String(eindUur).padStart(2, "0") + ":" + start.split(":")[1];
  } else {
    // Overnachting: aankomstdatum en vertrekdatum, zonder tijd.
    params.start_time = geval.van;
    params.end_time = geval.tot;
  }

  for (const [naam, gewenst] of geval.opties) {
    const veld = resource.velden.find((v) => v.name === naam);
    if (!veld) { ontbreekt.push("veld " + naam); continue; }
    let waarde = gewenst;
    if (keuzes(veld).length) {
      waarde = keuzes(veld).find((k) => k === gewenst || k.indexOf(gewenst) === 0);
      if (waarde === undefined) { ontbreekt.push(naam + " = " + gewenst); continue; }
    }
    params["rental_prop_" + naam] = waarde;
  }
  return { params: params, ontbreekt: ontbreekt };
}

/* ---------- uitvoer ---------- */

function opbouw(prijs, titels) {
  return (prijs.pricing_log_applied_rules || [])
    .filter((r) => r.price_diff !== undefined && Number(r.price_diff) !== 0)
    .map((r) => {
      const titel = (titels[r.number] || "regel " + r.number)
        .replace(/^\d+\.\s*/, "").replace(/^Reservation form item: /, "")
        .replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&")
        .replace(/[\s=:]+$/, "") + " (regel " + r.number + ")";
      return (r.number === 1 && !titels[1] ? "basisprijs" : titel) + ": " + euro(r.price_diff);
    });
}

function tabel(rijen) {
  const kop = ["Nr", "Omschrijving", "Verwacht", "Planyo", "Uitkomst"];
  const data = rijen.map((r) => [String(r.nr), r.tekst, r.verwachtTekst, r.planyoTekst, r.uitkomst]);
  const breed = kop.map((k, i) => Math.max(k.length, ...data.map((d) => d[i].length)));
  const regel = (cellen) => cellen.map((c, i) => (i === 2 || i === 3 ? c.padStart(breed[i]) : c.padEnd(breed[i]))).join("  ");
  return [regel(kop), breed.map((b) => "-".repeat(b)).join("  ")].concat(data.map(regel)).join("\n");
}

/* ---------- hoofdprogramma ---------- */

async function main() {
  const weekdag = (d) => new Date(d + "T12:00:00Z").getUTCDay();
  if (weekdag(DI) !== 2 || weekdag(DO) !== 4 || weekdag(ZA) !== 6 || weekdag(MA) !== 1) {
    throw new Error("De testdatums vallen niet op de bedoelde weekdagen.");
  }

  // 1. Formulieropties ophalen en tonen.
  const resources = {};
  for (const id of [DAY, OVN]) {
    resources[id] = {
      id: id,
      info: await planyo("get_resource_info", { resource_id: id }),
      velden: (await planyo("get_form_items", { resource_id: id })).items || []
    };
  }
  const overzicht = overzichtRegels(resources[DAY]).concat([""], overzichtRegels(resources[OVN]));
  console.log("FORMULIEROPTIES\n===============\n" + overzicht.join("\n") + "\n");

  // Titels van de prijsregels, voor de opbouw per testgeval.
  const titels = {};
  try {
    const prijsregels = await planyo("get_resource_pricing", { site_id: SITE });
    for (const d of Object.values(prijsregels.rule_details || {})) titels[d.rule_number] = d.rule_title;
  } catch (fout) { /* opbouw toont dan regelnummers */ }

  // 2. Testgevallen.
  const rijen = [];
  for (const geval of GEVALLEN) {
    const rij = { nr: geval.nr, tekst: geval.tekst, opbouw: [], opmerking: "" };
    rij.verwachtTekst = geval.nietBoekbaar ? "niet boekbaar" : euro(geval.verwacht);
    const { params, ontbreekt } = instellen(geval, resources[geval.resource]);

    if (ontbreekt.length) {
      rij.planyoTekst = "—";
      rij.uitkomst = "ONTBREEKT";
      rij.opmerking = "Niet in te stellen: " + ontbreekt.join(", ");
    } else {
      try {
        const prijs = await planyo("get_rental_price", params);
        const boekbaar = await planyo("can_make_reservation", params);
        const mogelijk = boekbaar.is_reservation_possible === true;
        rij.opbouw = opbouw(prijs, titels);

        if (geval.nietBoekbaar) {
          rij.planyoTekst = mogelijk ? "boekbaar, " + euro(prijs.total) : "niet boekbaar";
          rij.uitkomst = mogelijk ? "AFWIJKING" : "OK";
          rij.opmerking = mogelijk
            ? "Planyo laat deze boeking gewoon toe"
            : "Reden Planyo: " + (boekbaar.reason || "geen reden opgegeven");
        } else {
          rij.planyoTekst = euro(prijs.total);
          rij.uitkomst = Math.abs(Number(prijs.total) - geval.verwacht) < 0.005 ? "OK" : "AFWIJKING";
          const verschil = Number(prijs.total) - geval.verwacht;
          if (rij.uitkomst === "AFWIJKING") rij.opmerking = "Planyo rekent " + euro(Math.abs(verschil)) + (verschil < 0 ? " te weinig" : " te veel");
          if (!mogelijk) rij.opmerking += (rij.opmerking ? " · " : "") + "Nu niet boekbaar: " + (boekbaar.reason || "geen reden opgegeven");
        }
      } catch (fout) {
        rij.planyoTekst = "fout";
        rij.uitkomst = "AFWIJKING";
        rij.opmerking = zonderSleutel(fout.message);
      }
    }
    rij.params = Object.keys(params).filter((k) => k !== "resource_id" && k !== "quantity").map((k) => k.replace("rental_prop_", "") + "=" + params[k]);
    rijen.push(rij);
  }

  const tel = (u) => rijen.filter((r) => r.uitkomst === u).length;
  const samenvatting = tel("OK") + " OK · " + tel("AFWIJKING") + " AFWIJKING · " + tel("ONTBREEKT") + " ONTBREEKT";

  console.log("RESULTAAT\n=========\n" + tabel(rijen) + "\n\n" + samenvatting + "\n");
  for (const r of rijen.filter((x) => x.uitkomst !== "OK")) {
    console.log("#" + r.nr + " " + r.uitkomst + " — " + r.opmerking);
    if (r.opbouw.length) console.log("    opbouw Planyo: " + r.opbouw.join(" + "));
  }

  // 3. Wegschrijven.
  const md = [
    "# Planyo prijstest",
    "",
    "Gedraaid op " + new Date().toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" }) + " · site " + SITE + " · alleen prijzen opgevraagd, niets geboekt.",
    "",
    "**" + samenvatting + "**",
    "",
    "| Nr | Omschrijving | Verwacht | Planyo | Uitkomst |",
    "|---:|---|---:|---:|---|"
  ].concat(
    rijen.map((r) => "| " + [r.nr, r.tekst, r.verwachtTekst, r.planyoTekst, "**" + r.uitkomst + "**"].join(" | ") + " |"),
    ["", "## Toelichting per testgeval", ""],
    rijen.map((r) => "- **" + r.nr + ". " + r.tekst + "** — " + r.uitkomst + (r.opmerking ? ". " + r.opmerking : "") +
      "\n  - Gevraagd: `" + r.params.join("`, `") + "`" +
      (r.opbouw.length ? "\n  - Opbouw Planyo: " + r.opbouw.join(" + ") : "")),
    ["", "## Formulieropties", "", "```"], overzicht, ["```", ""]
  ).join("\n");
  fs.writeFileSync(RESULTAAT, zonderSleutel(md));
  console.log("\nOpgeslagen in tests/planyo-prijzen-resultaat.md");

  if (tel("AFWIJKING") || tel("ONTBREEKT")) process.exitCode = 1;
}

main().catch((fout) => {
  console.error("Test afgebroken: " + zonderSleutel(fout.message));
  process.exitCode = 2;
});
