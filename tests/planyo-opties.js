#!/usr/bin/env node
/*
 * Optietest Planyo — loopt ELKE optie van de zes boekingsformulieren na
 * (Angie, Malina Jacuzzi en Malina Zwembad, elk dagverblijf en overnachting)
 * en legt de prijs die Planyo rekent naast de prijs uit het dashboard
 * (Reserveringen, tabblad "Nieuwe reservering").
 *
 * Er wordt niets geboekt of gewijzigd: planyo-api.js laat alleen leesmethodes
 * toe. Een toeslag meten we door dezelfde boeking twee keer op te vragen, met
 * en zonder de optie; het verschil is wat Planyo voor die optie rekent.
 *
 * De dashboardprijzen hieronder zijn op 01-10-2026 overgenomen uit
 * bwf_tariefblokken, bwf_persoonstoeslagen en wz_extras. Verandert daar iets,
 * pas het dan hier ook aan.
 *
 * Draaien:  node tests/planyo-opties.js
 * Uitkomst: tabel in de terminal + tests/planyo-opties-resultaat.md en .json
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { planyo, zonderSleutel, keuzes, euro } = require("./planyo-api");

const DAY = "251803"; // B&W Angie Wellness Suite - Dagverblijf
const OVN = "252021"; // B&W Angie Wellness Suite - Overnachting
const JAC_DAG = "252400", JAC_NACHT = "252405"; // B&W Malina Jacuzzi Suite
const ZWE_DAG = "252390", ZWE_NACHT = "252396"; // B&W Malina Zwembad Suite
const FORMULIEREN = {
  [DAY]: ["Angie", "Dagverblijf"], [OVN]: ["Angie", "Overnachting"],
  [JAC_DAG]: ["Malina Jacuzzi", "Dagverblijf"], [JAC_NACHT]: ["Malina Jacuzzi", "Overnachting"],
  [ZWE_DAG]: ["Malina Zwembad", "Dagverblijf"], [ZWE_NACHT]: ["Malina Zwembad", "Overnachting"]
};
const SUITES = ["Angie", "Malina Jacuzzi", "Malina Zwembad"];
const isDag = (res) => FORMULIEREN[res][1] === "Dagverblijf";

const DASH = "dashboard";
const TEKST = "tekst in Planyo-formulier";

// Woensdag 18-11-2026, 12:00-15:00, 2 volwassenen.
const DAG = { start_time: "2026-11-18 12:00", end_time: "2026-11-18 15:00" };
// Dinsdag 17-11-2026, 1 nacht, check-in 20:00, 2 volwassenen.
const NACHT = { start_time: "2026-11-17", end_time: "2026-11-18" };
const LAAT = [["Inchecktijd", "20:00"]];
const VROEG = [["Inchecktijd", "13:00"]];
const BRUID = [["Inchecktijd", "01:00"], ["Honeymoon_overnachting", "yes"]];

/* ---------- de controles ---------- */

const CONTROLES = [];
const totaal = (res, groep, optie, tijd, zet, verwacht, bron, opm) =>
  CONTROLES.push({ res, groep, optie, soort: "totaal", tijd, basis: [], zet, verwacht, bron, opm: opm || "" });
const toeslag = (res, groep, optie, zet, verwacht, bron, opm, basis, tijd) =>
  CONTROLES.push({ res, groep, optie, soort: "toeslag", tijd: tijd || (isDag(res) ? DAG : NACHT),
    basis: (res === OVN ? LAAT : []).concat(basis || []), zet, verwacht, bron, opm: opm || "" });

// Dagverblijf: de zeven tijdsblokken uit het dashboard.
[["12:00", "15:00", 249], ["12:30", "15:30", 249], ["13:00", "16:00", 249],
 ["12:00", "16:00", 269], ["12:30", "16:30", 269], ["13:00", "17:00", 269],
 ["13:00", "18:00", 299]].forEach(([van, tot, prijs]) =>
  totaal(DAY, "Tijdsblokken", van + "–" + tot, { start_time: "2026-11-18 " + van, end_time: "2026-11-18 " + tot }, [], prijs, DASH));
totaal(DAY, "Tijdsblokken", "12:00–15:00 op zaterdag", { start_time: "2026-11-21 12:00", end_time: "2026-11-21 15:00" }, [], 249, DASH);

// Overnachting: elke dag van de week, beide inchecktijden.
[["ma", "16", 399, 449], ["di", "17", 399, 449], ["wo", "18", 399, 449], ["do", "19", 449, 529],
 ["vr", "20", 449, 529], ["za", "21", 449, 529], ["zo", "22", 449, 529]].forEach(([dag, d, laat, vroeg]) => {
  const tijd = { start_time: "2026-11-" + d, end_time: "2026-11-" + (Number(d) + 1) };
  totaal(OVN, "Tijdsblokken", "Late check-in 20:00, " + dag, tijd, LAAT, laat, DASH);
  totaal(OVN, "Tijdsblokken", "Relax & Stay 13:00, " + dag, tijd, VROEG, vroeg, DASH);
});
totaal(OVN, "Tijdsblokken", "2 nachten di–do, 20:00", { start_time: "2026-11-17", end_time: "2026-11-19" }, LAAT, 798, DASH);
totaal(OVN, "Tijdsblokken", "7 nachten ma–ma, 20:00", { start_time: "2026-11-16", end_time: "2026-11-23" }, LAAT, 2993, DASH,
  "Het dashboard kent geen weekkorting. Je eerste testlijst ging uit van 5% korting (€ 2.843,35).");
totaal(OVN, "Tijdsblokken", "Bruidsnacht 01:00, za", { start_time: "2026-11-21", end_time: "2026-11-22" }, BRUID, 849, DASH);
totaal(OVN, "Tijdsblokken", "Bruidsnacht 01:00, di", NACHT, BRUID, 849, DASH,
  "Je eerste testlijst zei: doordeweeks niet boekbaar. Planyo laat het toe, tegen het gewone tarief.");

["12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"].forEach((uur, i) =>
  toeslag(OVN, "Uitchecktijd", "Laat uitchecken " + uur, [["Uitchecktijd", uur]], 50 * (i + 1), DASH));

// Personen
toeslag(DAY, "Personen", "3e volwassene", [["adults", "3"]], 60, DASH);
toeslag(DAY, "Personen", "3e en 4e volwassene", [["adults", "4"]], 120, DASH);
toeslag(DAY, "Personen", "1 kind 2–12 jaar", [["Kinderen__2_12_jaar", "1"]], 25, DASH);
toeslag(DAY, "Personen", "2 kinderen 2–12 jaar", [["Kinderen__2_12_jaar", "2"]], 50, DASH);
toeslag(DAY, "Personen", "1 baby 0–1 jaar", [["Baby_s_en_peuters_0_1_jaar", "1"]], 0, DASH);
toeslag(OVN, "Personen", "3e volwassene, 1 nacht", [["adults", "3"]], 100, DASH);
toeslag(OVN, "Personen", "3e volwassene, 2 nachten", [["adults", "3"]], 200, DASH, "", [],
  { start_time: "2026-11-17", end_time: "2026-11-19" });
toeslag(OVN, "Personen", "1 kind 2–12 jaar", [["Kinderen__2_12_jaar", "1"]], 50, DASH);
toeslag(OVN, "Personen", "2 kinderen 2–12 jaar", [["Kinderen__2_12_jaar", "2"]], 100, DASH);
toeslag(OVN, "Personen", "1 baby 0–1 jaar", [["Baby_s_en_peuters_0_1_jaar", "1"]], 0, DASH);

// Alles wat op beide formulieren staat.
for (const res of [DAY, OVN]) {
  const A = "Arrangementen", M = "Eten en drinken", C = "Cadeaus en service";
  const maxVolw = res === DAY ? "4" : "3";
  toeslag(res, A, "Verjaardag arrangement", [["Verjaardag_arrangement", "yes"]], 75, DASH);
  toeslag(res, A, "Verjaardag arrangement bij " + maxVolw + " volwassenen", [["Verjaardag_arrangement", "yes"]],
    75 + 5 * (Number(maxVolw) - 2), TEKST, "Het dashboard rekent altijd € 75, zonder € 5 per extra persoon.", [["adults", maxVolw]]);
  toeslag(res, A, "Verjaardag deluxe arrangement", [["Verjaardag_deluxe_arrangement", "yes"]], 125, DASH);
  toeslag(res, A, "Romantisch arrangement", [["Romantisch_arrangement", "yes"]], 75, DASH);
  toeslag(res, A, "VIP arrangement", [["VIP_Arrangement", "yes"]], 250, DASH);
  toeslag(res, A, "365 Valentine romantisch deluxe", [["365_Valentine__Romantisch_deluxe", "yes"]], 300, DASH);
  if (res === DAY) {
    toeslag(res, A, "Bridal- / Babyshower", [["Bridal_____Babyshower_arrangement", "yes"]], 1000, DASH);
    toeslag(res, A, "Kidspool party", [["Kidspool_party_arrangement", "yes"]], 850, DASH,
      "Dashboard: € 850 t/m 11 jaar, € 1.000 voor 12+ of gemengd.");
  }
  /* Het vinkje staat in het formulier standaard AAN, dus dit betaalt elke gast
     die online boekt. Volgens dashboard en formuliertekst is het inbegrepen. */
  const AI = "Staat standaard aangevinkt, dus elke online boeking betaalt dit. Het formulier belooft € 20 korting bij uitvinken.";
  toeslag(res, A, "All-inclusive aangevinkt, 2 volwassenen", [["All_inclusive_arrangementen", "yes"]], 0, DASH, AI);
  toeslag(res, A, "All-inclusive aangevinkt, " + maxVolw + " volwassenen", [["All_inclusive_arrangementen", "yes"]], 0, DASH, AI, [["adults", maxVolw]]);
  toeslag(res, A, "All-inclusive aangevinkt, 2 volw. + 2 kinderen", [["All_inclusive_arrangementen", "yes"]], 0, DASH, AI, [["Kinderen__2_12_jaar", "2"]]);

  toeslag(res, M, "Ontbijt, 2 personen", [["Ontbijt", "2 personen"]], 39, DASH);
  toeslag(res, M, "Ontbijt, 3 personen", [["Ontbijt", "3 personen"]], 58.5, TEKST);
  toeslag(res, M, "Ontbijt, 4 personen", [["Ontbijt", "4 personen"]], 78, TEKST);
  toeslag(res, M, "Luxe champagne ontbijt", [["Luxe_champagne_ontbijt", "yes"]], 79, DASH);
  toeslag(res, M, "Lunch, 2 personen", [["Lunch", "Standaard"], ["Lunch___aantal_personen", "2 personen"]], 39, DASH);
  toeslag(res, M, "Lunch, 3 personen", [["Lunch", "Standaard"], ["Lunch___aantal_personen", "3 personen"]], 58.5, TEKST);
  toeslag(res, M, "Lunch, 4 personen", [["Lunch", "Standaard"], ["Lunch___aantal_personen", "4 personen"]], 78, TEKST);
  toeslag(res, M, "Burgermenu, 1 stuk", [["Burgermenu", "Black angus beef"], ["Burgermenu___aantal_personen", "1"]], 39, DASH);
  toeslag(res, M, "Burgermenu, 3 stuks", [["Burgermenu", "Crispy chicken"], ["Burgermenu___aantal_personen", "3"]], 117, DASH);
  toeslag(res, M, "Deluxe menu (2 personen)", [["Deluxe_menu", "yes"]], 14, TEKST, "Staat niet in het dashboard.");
  toeslag(res, M, "Chicken platter", [["Chicken_platter", "yes"]], 39, DASH, "In het formulier staat geen prijs.");
  toeslag(res, M, "Warme borrelplank, 1 stuk", [["Warme_borrelplank", "1"]], 30, DASH);
  toeslag(res, M, "Charcuterie board, 1 stuk", [["Charcuterie_Board___warme_en_koude_tapas_", "1"]], 49, DASH, "In het formulier staat € 39.");
  toeslag(res, M, "Sushi Experience", [["Sushi_Experience", "yes"]], 75, DASH);
  toeslag(res, M, "High Tea, 4 personen", [["High_Tea", "yes"]], 98, DASH, "Dashboard: € 24,50 p.p. In het formulier staat geen prijs en er hangt geen prijsregel aan.",
    [["Kinderen__2_12_jaar", "2"]]);
  toeslag(res, M, "Tasting tree experience", [["Tasting_tree_experience", "yes"]], 69, DASH, "In het formulier staat geen prijs.");
  toeslag(res, M, "Fruitschaal", [["Fruitschaal", "yes"]], 20, TEKST, "Staat niet in het dashboard.");
  toeslag(res, M, "Mocktail karaf", [["Mocktail_Karaf", "Mojito"]], 30, DASH);
  toeslag(res, M, "Wijn of prosecco, 1 fles", [["Wijn_of_prosecco", "Prosecco"], ["Wijn_of_prosecco___aantal_flessen", "1"]], 30, DASH);
  toeslag(res, M, "Wijn of prosecco, 2 flessen", [["Wijn_of_prosecco", "Chardonnay"], ["Wijn_of_prosecco___aantal_flessen", "2"]], 60, DASH);
  toeslag(res, M, "Moët & Chandon Ice", [["Moet_en_Chandon_Ice_Edition", "yes"]], 125, DASH);
  toeslag(res, M, "Eigen consumptie toeslag", [["Eigen_consumptie_toeslag", "yes"]], 15, DASH);

  toeslag(res, C, "Rozenbeer", [["Rozenbeer_Cadeau", "yes"]], 25, DASH);
  toeslag(res, C, "Zeeprozen boeket", [["Zeeprozen_Boeket", "yes"]], 35, DASH);
  toeslag(res, C, "Wellness Care Set", [["Wellness_Care_Set", "yes"]], 35, TEKST, "Staat niet in het dashboard.");
  toeslag(res, C, "Massagetafel", [["Massagetafel", "yes"]], 25, DASH, "In het dashboard alleen bij Lelystad.");
  toeslag(res, C, "Shisha Love66", [["Shisha", "Love66"]], 30, DASH);
  toeslag(res, C, "Shisha Blue Mystic", [["Shisha", "Blue Mystic"]], 30, DASH, "In het formulier staat € 25; het dashboard rekent € 30 voor elke waterpijp.");
  toeslag(res, C, "Shisha Mi Amore", [["Shisha", "Mi Amore"]], 30, DASH, "In het formulier staat € 25; het dashboard rekent € 30 voor elke waterpijp.");
  toeslag(res, C, "Extra badlinnen pakket", [["Extra_badlinnen_pakket", "yes"]], 25, TEKST, "Staat niet in het dashboard.");
}

/* ---------- Malina Jacuzzi en Malina Zwembad (Lelystad) ---------- */

const WEEK = [["ma", "16", 0], ["di", "17", 0], ["wo", "18", 0], ["do", "19", 1], ["vr", "20", 1], ["za", "21", 1], ["zo", "22", 1]];
const dagblok = (res, van, tot, prijs) =>
  totaal(res, "Tijdsblokken", van + "–" + tot, { start_time: "2026-11-18 " + van, end_time: "2026-11-18 " + tot }, [], prijs, DASH);
const nacht = (d) => ({ start_time: "2026-11-" + d, end_time: "2026-11-" + (Number(d) + 1) });

// Jacuzzi dagverblijf
[["12:00", "14:30", 199], ["14:30", "17:00", 199], ["12:00", "15:00", 229], ["14:00", "17:00", 229],
 ["15:00", "18:00", 229], ["12:00", "16:00", 259], ["12:00", "17:00", 299]].forEach((b) => dagblok(JAC_DAG, b[0], b[1], b[2]));
// Zwembad dagverblijf
[["12:30", "15:30", 299], ["13:00", "16:00", 299], ["12:30", "16:30", 349], ["13:00", "17:00", 349]]
  .forEach((b) => dagblok(ZWE_DAG, b[0], b[1], b[2]));

// Jacuzzi overnachting: het formulier heeft geen keuze voor de inchecktijd.
WEEK.forEach(([dag, d, weekend]) => {
  totaal(JAC_NACHT, "Tijdsblokken", "Late check-in 20:00, " + dag, nacht(d), [], weekend ? 399 : 379, DASH,
    "In dit formulier is geen inchecktijd te kiezen; dit is de enige prijs die Planyo geeft.");
});
totaal(JAC_NACHT, "Tijdsblokken", "Relax & Stay 14:00, ma–wo", nacht("17"), [["Inchecktijd", "14:00"]], 399, DASH);
totaal(JAC_NACHT, "Tijdsblokken", "Relax & Stay 14:00, do–zo", nacht("21"), [["Inchecktijd", "14:00"]], 449, DASH);
totaal(JAC_NACHT, "Tijdsblokken", "Bruidsnacht 01:00", nacht("21"), [["Inchecktijd", "01:00"]], 699, DASH);

// Zwembad overnachting
WEEK.forEach(([dag, d, weekend]) => {
  totaal(ZWE_NACHT, "Tijdsblokken", "Relax & Stay, " + dag, nacht(d), [["Inchecktijd", "20:00"]], weekend ? 529 : 479, DASH,
    "Dashboard: check-in 19:00. Planyo noemt het 20:00 - Standaard.");
  totaal(ZWE_NACHT, "Tijdsblokken", "Early check-in 13:00, " + dag, nacht(d), [["Inchecktijd", "13:00"]], weekend ? 849 : 749, DASH);
});
totaal(ZWE_NACHT, "Tijdsblokken", "Bruidsnacht 01:00, za", nacht("21"), [["Inchecktijd", "01:00"]], 999, DASH);

// Personen: [formulier, extra volwassene, kind]
[[JAC_DAG, 60, 25], [JAC_NACHT, 100, 50], [ZWE_DAG, 75, 50], [ZWE_NACHT, 125, 75]].forEach(([res, volw, kind]) => {
  toeslag(res, "Personen", "3e volwassene", [["adults", "3"]], volw, DASH);
  toeslag(res, "Personen", "3e en 4e volwassene", [["adults", "4"]], 2 * volw, DASH);
  toeslag(res, "Personen", "1 kind 2–12 jaar", [["Kinderen__2_12_jaar", "1"]], kind, DASH);
  toeslag(res, "Personen", "2 kinderen 2–12 jaar", [["Kinderen__2_12_jaar", "2"]], 2 * kind, DASH);
  toeslag(res, "Personen", "1 baby 0–1 jaar", [["Baby_s_en_peuters_0_1_jaar", "1"]], 0, DASH);
});

// Opties. Een juiste prijs van null betekent: Planyo biedt het aan, maar het
// dashboard kent het voor Lelystad niet. Dat moet Angela nakijken.
for (const res of [JAC_DAG, JAC_NACHT, ZWE_DAG, ZWE_NACHT]) {
  const A = "Arrangementen", M = "Eten en drinken", C = "Cadeaus en service";
  const ALMERE = (prijs) => "In het dashboard alleen bij Almere (" + prijs + ").";
  toeslag(res, A, "Verjaardag arrangement", [["Verjaardag_arrangement", "yes"]], 75, DASH);
  toeslag(res, A, "Verjaardag deluxe arrangement", [["Verjaardag_deluxe_arrangement", "yes"]], 125, DASH);
  toeslag(res, A, "Romantisch arrangement", [["Romantisch_arrangement", "yes"]], 75, DASH);
  toeslag(res, A, "VIP arrangement", [["VIP_Arrangement", "yes"]], 250, DASH);
  toeslag(res, A, "365 Valentine romantisch deluxe", [["365_Valentine__Romantisch_deluxe", "yes"]], 300, DASH);

  toeslag(res, M, "Ontbijt", [["Ontbijt", "2 personen"]], 39, DASH);
  toeslag(res, M, "Lunch", [["Lunch___aantal_personen", "2 personen"]], 39, DASH);
  toeslag(res, M, "Chicken wings menu", [["Chicken_wings_menu", "yes"]], 35, DASH);
  toeslag(res, M, "Warme borrelplank", [["Warme_borrelplank", "yes"]], 30, DASH);
  toeslag(res, M, "Burgermenu: Black angus beef", [["Burgermenu", "Black angus beef"]], 39, DASH);
  toeslag(res, M, "Burgermenu: Kip burger", [["Burgermenu", "Kip burger"]], 39, DASH);
  toeslag(res, M, "Burgermenu: Crispy chicken", [["Burgermenu", "Crispy chicken"]], 39, DASH);
  toeslag(res, M, "Crispy Chickenburger (los vinkje)", [["Crispy_Chickenburger", "yes"]], 39, DASH);
  toeslag(res, M, "Chicken burger menu (los vinkje)", [["Chicken_burger_menu", "yes"]], 39, DASH);
  toeslag(res, M, "Sushi Experience", [["Sushi_Experience", "yes"]], 75, DASH);
  toeslag(res, M, "Mocktail karaf", [["Mocktail_Karaf", "Mojito"]], 30, DASH);
  ["Prosecco", "Chardonnay", "Zoet witte wijn", "Rode wijn"].forEach((wijn) =>
    toeslag(res, M, "Wijn of prosecco: " + wijn, [["Wijn_of_prosecco", wijn]], 30, DASH));
  toeslag(res, M, "Moët & Chandon Ice", [["Moet_en_Chandon_Ice_Edition", "yes"]], 125, DASH);
  toeslag(res, M, "Eigen consumptie toeslag", [["Eigen_consumptie_toeslag", "15"]], 15, DASH,
    "In dit formulier is het een tekstvak waar standaard 15 in staat, geen vinkje.");

  toeslag(res, C, "Rozenbeer", [["Rozenbeer_Cadeau", "yes"]], 25, DASH);
  toeslag(res, C, "Zeeprozen boeket", [["Zeeprozen_Boeket", "yes"]], 35, DASH);
  toeslag(res, C, "Massagetafel", [["Massagetafel", "yes"]], 25, DASH);
  toeslag(res, C, "Shisha Love66", [["Shisha", "Love66"]], 30, DASH);
  toeslag(res, C, "Shisha Blue Mystic", [["Shisha", "Blue Mystic"]], 30, DASH);
  toeslag(res, C, "Shisha Mi Amore", [["Shisha", "Mi Amore"]], 30, DASH);

  if (isDag(res)) {
    toeslag(res, A, "Bridal- / Babyshower", [["Bridal_____Babyshower_arrangement", "yes"]], null, DASH, ALMERE("€ 1.000"));
    toeslag(res, M, "Luxe champagne ontbijt", [["Luxe_champagne_ontbijt", "yes"]], null, DASH, ALMERE("€ 79"));
    toeslag(res, M, "Charcuterie board", [["Charcuterie_Board___warme_en_koude_tapas_", "yes"]], null, DASH, ALMERE("€ 49"));
    toeslag(res, M, "Chicken platter", [["Chicken_platter", "yes"]], null, DASH, ALMERE("€ 39"));
    toeslag(res, M, "High Tea, 4 personen", [["High_Tea", "yes"]], null, DASH, ALMERE("€ 24,50 p.p."), [["Kinderen__2_12_jaar", "2"]]);
    toeslag(res, M, "Tasting tree experience", [["Tasting_tree_experience", "yes"]], null, DASH, ALMERE("€ 69"));
    toeslag(res, C, "Wellness Care Set", [["Wellness_Care_Set", "yes"]], null, DASH, "Staat niet in het dashboard.");
  }
}

// Staat wel in het dashboard (Almere), maar is in Planyo niet te kiezen.
const ALLEEN_DASHBOARD = [
  ["Overnachting", "Wellness Experience 13:00 met ontbijt, ma–wo", 449],
  ["Overnachting", "Wellness Experience 13:00 met ontbijt, do–zo", 549],
  ["Beide", "Fles champagne", 50],
  ["Beide", "Bier per fles", 6],
  ["Beide", "Rookterras", 10],
  ["Beide", "Rozen hart", 25],
  ["Beide", "Eerder inchecken 30 min / 1 / 2 / 3 / 4 uur", "30 / 50 / 100 / 150 / 200"],
  ["Beide", "Laat inchecken in overleg", 25],
  ["Dagverblijf", "Kids Poolparty 12+ of gemengd", 1000],
  ["Dagverblijf", "Feest: thema versiering", 150],
  ["Dagverblijf", "Feest: ballonnenboog", 125],
  ["Dagverblijf", "Feest: sweettable", 125],
  ["Dagverblijf", "Feest: gepersonaliseerde taart", 75],
  ["Dagverblijf", "Feest: gepersonaliseerde cupcakes", 50],
  ["Dagverblijf", "Feest: fotomoment met fotoboek", 100],
  ["Dagverblijf", "Feest: extra uur", 100],
  ["Dagverblijf", "Feest: luxe sushi schaal (meerprijs)", 100]
];

/* ---------- uitvoeren ---------- */

const velden = {};
const prijzen = {};

// Zet [veld, waarde]-paren om naar rental_prop_-parameters.
function props(res, paren) {
  const uit = {}, ontbreekt = [];
  for (const [naam, gewenst] of paren) {
    const veld = velden[res].find((v) => v.name === naam);
    if (!veld) { ontbreekt.push("veld " + naam); continue; }
    let waarde = gewenst;
    if (keuzes(veld).length) {
      waarde = keuzes(veld).find((k) => k === gewenst || k.indexOf(gewenst) === 0);
      if (waarde === undefined) { ontbreekt.push(naam + " = " + gewenst); continue; }
    }
    uit["rental_prop_" + naam] = waarde;
  }
  return { uit, ontbreekt };
}

async function prijs(res, tijd, paren) {
  /* Het aantal volwassenen gaat altijd expliciet mee. Het boekingsformulier
     stuurt het ook altijd mee; laat je het weg, dan telt Planyo de regels
     "per volwassene" en "vanaf 4 personen" anders dan een gast ze krijgt. */
  if (!paren.some((p) => p[0] === "adults")) paren = [["adults", "2"]].concat(paren);
  const { uit, ontbreekt } = props(res, paren);
  if (ontbreekt.length) return { ontbreekt };
  const params = Object.assign({ resource_id: res, quantity: "1" }, tijd, uit);
  const sleutel = JSON.stringify(params);
  if (prijzen[sleutel] === undefined) prijzen[sleutel] = Number((await planyo("get_rental_price", params)).total);
  return { totaal: prijzen[sleutel] };
}

async function boekbaar(res, tijd, paren) {
  if (!paren.some((p) => p[0] === "adults")) paren = [["adults", "2"]].concat(paren);
  return planyo("can_make_reservation", Object.assign({ resource_id: res, quantity: "1" }, tijd, props(res, paren).uit));
}

async function main() {
  for (const res of Object.keys(FORMULIEREN)) velden[res] = (await planyo("get_form_items", { resource_id: res })).items || [];

  const rijen = [];
  for (const c of CONTROLES) {
    const rij = { suite: FORMULIEREN[c.res][0], formulier: FORMULIEREN[c.res][1], groep: c.groep, optie: c.optie,
      verwacht: c.verwacht, bron: c.bron, opmerking: c.opm, planyo: null };
    try {
      const met = await prijs(c.res, c.tijd, c.basis.concat(c.zet));
      if (met.ontbreekt) {
        rij.uitkomst = "ONTBREEKT";
        rij.opmerking = "Niet te kiezen in Planyo: " + met.ontbreekt.join(", ");
      } else {
        const zonder = c.soort === "toeslag" ? (await prijs(c.res, c.tijd, c.basis)).totaal : 0;
        rij.planyo = Math.round((met.totaal - zonder) * 100) / 100;
        if (c.verwacht === null) rij.uitkomst = "NAKIJKEN";
        else rij.uitkomst = Math.abs(rij.planyo - c.verwacht) < 0.005 ? "GOED" : "FOUT";
        // Een tijdsblok moet ook echt te boeken zijn, niet alleen een prijs hebben.
        if (c.soort === "totaal" && c.groep === "Tijdsblokken") {
          const b = await boekbaar(c.res, c.tijd, c.basis.concat(c.zet));
          const reden = String(b.reason || "geen reden opgegeven").replace(/<[^>]+>/g, " ").trim();
          if (!b.is_reservation_possible && /niet beschikbaar|not available/i.test(reden)) {
            // De suite is die dag bezet of dicht. Dat zegt niets over de instelling.
            rij.opmerking = "Op de testdatum niet vrij; de prijs is wel gecontroleerd." + (rij.opmerking ? " · " + rij.opmerking : "");
          } else if (!b.is_reservation_possible) {
            rij.nietBoekbaar = true;
            rij.uitkomst = "FOUT";
            rij.opmerking = "Niet te boeken in Planyo: " + reden + (rij.opmerking ? " · " + rij.opmerking : "");
          }
        }
      }
    } catch (fout) {
      rij.uitkomst = "FOUT";
      rij.opmerking = zonderSleutel(fout.message);
    }
    rijen.push(rij);
  }

  const tel = (u, suite) => rijen.filter((r) => r.uitkomst === u && (!suite || r.suite === suite)).length;
  const stand = (suite) => tel("GOED", suite) + " goed · " + tel("FOUT", suite) + " fout · " +
    tel("ONTBREEKT", suite) + " ontbreekt · " + tel("NAKIJKEN", suite) + " nakijken";
  const samenvatting = stand();
  const planyoTekst = (r) => r.nietBoekbaar ? "niet te boeken" : euro(r.planyo);

  // Terminal
  for (const suite of SUITES) {
    for (const formulier of ["Dagverblijf", "Overnachting"]) {
      const kop = suite + " — " + formulier;
      console.log("\n" + kop.toUpperCase() + "\n" + "=".repeat(kop.length));
      let groep = "";
      for (const r of rijen.filter((x) => x.suite === suite && x.formulier === formulier)) {
        if (r.groep !== groep) { groep = r.groep; console.log("\n  " + groep); }
        console.log("    " + r.uitkomst.padEnd(10) + r.optie.padEnd(42) + euro(r.verwacht).padStart(11) + planyoTekst(r).padStart(15));
      }
    }
    console.log("\n  " + suite + ": " + stand(suite));
  }
  console.log("\nTotaal: " + samenvatting + "   (kolommen: uitkomst, optie, juiste prijs, Planyo)");

  // Markdown
  const md = ["# Planyo optietest — alle suites", "",
    "Gedraaid op " + new Date().toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" }) +
    " · alleen prijzen opgevraagd, niets geboekt · juiste prijs = dashboard, tenzij anders vermeld.", "",
    "**" + samenvatting + "**", ""];
  for (const suite of SUITES) {
    md.push("# " + suite, "", stand(suite), "");
    for (const formulier of ["Dagverblijf", "Overnachting"]) {
      md.push("## " + suite + " — " + formulier, "", "| Uitkomst | Groep | Optie | Juiste prijs | Planyo | Opmerking |", "|---|---|---|---:|---:|---|");
      for (const r of rijen.filter((x) => x.suite === suite && x.formulier === formulier)) {
        md.push("| " + [r.uitkomst === "GOED" ? "goed" : "**" + r.uitkomst + "**", r.groep, r.optie, euro(r.verwacht), planyoTekst(r),
          (r.bron === TEKST ? "Juiste prijs volgens " + TEKST + ". " : "") + r.opmerking].join(" | ") + " |");
      }
      md.push("");
    }
  }
  md.push("## Angie: staat in het dashboard, niet in Planyo", "", "| Formulier | Optie | Prijs dashboard |", "|---|---|---:|");
  for (const [f, o, p] of ALLEEN_DASHBOARD) md.push("| " + f + " | " + o + " | " + (typeof p === "number" ? euro(p) : "€ " + p) + " |");
  md.push("");
  fs.writeFileSync(path.join(__dirname, "planyo-opties-resultaat.md"), zonderSleutel(md.join("\n")));
  fs.writeFileSync(path.join(__dirname, "planyo-opties-resultaat.json"),
    zonderSleutel(JSON.stringify({ gedraaid: new Date().toISOString(), rijen, alleenDashboard: ALLEEN_DASHBOARD }, null, 1)));
  console.log("Opgeslagen in tests/planyo-opties-resultaat.md en .json");

  if (tel("FOUT") || tel("ONTBREEKT") || tel("NAKIJKEN")) process.exitCode = 1;
}

main().catch((fout) => {
  console.error("Test afgebroken: " + zonderSleutel(fout.message));
  process.exitCode = 2;
});
