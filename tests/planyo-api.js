/*
 * Gedeelde Planyo-aanroep voor de prijstests.
 *
 * Alleen de leesmethodes uit TOEGESTAAN kunnen worden aangeroepen; er is dus
 * geen weg om vanuit een test iets te boeken of te wijzigen. De sleutel komt
 * uit .env (PLANYO_API_KEY) en wordt nergens getoond of weggeschreven.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ENDPOINT = "https://www.planyo.com/rest/";

const TOEGESTAAN = [
  "get_resource_info",
  "get_form_items",
  "get_resource_pricing",
  "get_rental_price",
  "can_make_reservation"
];

function leesSleutel() {
  if (process.env.PLANYO_API_KEY) return process.env.PLANYO_API_KEY.trim();
  const bestand = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(bestand)) throw new Error(".env niet gevonden in de projectmap.");
  const regels = fs.readFileSync(bestand, "utf8").split(/\r?\n/).map((r) => r.trim()).filter((r) => r && r[0] !== "#");
  for (const regel of regels) {
    const m = regel.match(/^(?:export\s+)?PLANYO_API_KEY\s*=\s*(.*)$/);
    if (m) return m[1].replace(/^["']|["']$/g, "").trim();
  }
  // .env met alleen de kale sleutel (zonder naam ervoor) accepteren we ook.
  if (regels.length === 1 && regels[0].indexOf("=") < 0) {
    console.log("Let op: .env bevat alleen de sleutel. Zet er PLANYO_API_KEY= voor.\n");
    return regels[0];
  }
  throw new Error("PLANYO_API_KEY staat niet in .env.");
}

const SLEUTEL = leesSleutel();
const zonderSleutel = (tekst) => String(tekst).split(SLEUTEL).join("***");

async function planyo(method, params) {
  if (TOEGESTAAN.indexOf(method) < 0) throw new Error("Methode niet toegestaan in deze test: " + method);
  const body = new URLSearchParams(Object.assign({ method: method, api_key: SLEUTEL, language: "NL" }, params || {}));
  let json;
  try {
    const antwoord = await fetch(ENDPOINT, { method: "POST", body: body });
    json = JSON.parse(await antwoord.text());
  } catch (fout) {
    throw new Error(method + ": geen geldig antwoord van Planyo (" + zonderSleutel(fout.message) + ")");
  }
  if (json.response_code !== 0) throw new Error(method + ": " + zonderSleutel(json.response_message));
  return json.data;
}

// De keuzes van een keuzelijst, zoals Planyo ze teruggeeft (kommagescheiden).
function keuzes(veld) {
  return String(veld.dropdown_values || "").split(",").map((k) => k.trim()).filter(Boolean);
}

const euro = (bedrag) => bedrag === null || bedrag === undefined
  ? "—"
  : (Number(bedrag) < 0 ? "− " : "") + "€ " +
    Math.abs(Number(bedrag)).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

module.exports = { planyo, zonderSleutel, keuzes, euro };
