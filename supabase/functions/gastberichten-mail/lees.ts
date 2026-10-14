// Leest één gastbericht-mail van Booking.com. Geen Deno- of netwerkcode: los te testen
// (tests/gastberichten-lees.test.mjs).
//
// Twee opmaken, gezien 13-10-2026 (boeking 5857362529):
//   A. Een gestructureerd verzoek ("Ik wil graag om 15:00 - 16:00 inchecken"), met daaronder
//      de keuzes "Accepteer gratis / Accepteer met toeslag / ... / Anders".
//   B. Een vrij bericht ("2 year anniversary"), met "##- Typ een antwoord boven deze lijn -##"
//      bovenaan en een knop "Beantwoorden" met de link naar de Extranet.
// Beide eindigen met "Reserveringsgegevens": naam gast, inchecken, uitchecken, accommodatie,
// boekingsnummer. Engelstalige varianten worden ook herkend.

// deno-lint-ignore no-explicit-any
export type Rij = Record<string, any>;

const MAANDEN: Record<string, number> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2,
  mrt: 3, maa: 3, maart: 3, mar: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  aug: 8, augustus: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/* "do 22 okt 2026", "donderdag 22 oktober 2026", "Thursday, 22 October 2026" → "2026-10-22" */
export function leesDatum(s: string): string | null {
  const m = String(s || "").match(/(\d{1,2})\s+([A-Za-zé]+)\.?\s+(\d{4})/);
  if (!m) return null;
  const maand = MAANDEN[m[2].toLowerCase()];
  const dag = Number(m[1]);
  if (!maand || dag < 1 || dag > 31) return null;
  return `${m[3]}-${String(maand).padStart(2, "0")}-${String(dag).padStart(2, "0")}`;
}

/* Naam van de accommodatie in de mail → suite in het dashboard. "Malina" alleen is niet genoeg. */
export function suiteVan(accommodatie: string | null): string | null {
  const a = String(accommodatie || "").toLowerCase();
  if (/angie/.test(a)) return "angie";
  if (/jacuzzi/.test(a)) return "malina_jacuzzi";
  if (/deluxe|zwembad|pool/.test(a)) return "malina_deluxe";
  return null;
}

/* De waarde na een label; het label mag op een eigen regel staan met de waarde eronder. */
function naLabel(tekst: string, labels: string): string | null {
  const m = tekst.match(new RegExp(`(?:^|\\n)\\s*(?:${labels})\\s*:[ \\t]*\\n?[ \\t]*([^\\n]+)`, "i"));
  return m ? m[1].trim() || null : null;
}

const EINDE = /^(accepteer gratis|accept for free|accepteer met toeslag|afhankelijk van beschikbaarheid|niet geaccepteerd|beantwoorden|reply|reserveringsgegevens|reservation details|booking details|_{5,}|-->)/i;

export function leesBookingMail(mail: Rij): Rij {
  const van = String(mail.van ?? "");
  const tekst = String(mail.tekst ?? "")
    .replace(/\r/g, "")
    .replace(/ /g, " ")
    .replace(/\*/g, "");
  const regels = tekst.split("\n").map((r) => r.trim());

  // Het nummer: eerst uit het afzenderadres (5857362529-xxxx@guest.booking.com), dan uit de tekst.
  const nummer =
    van.match(/(\d{8,12})-[^@\s]*@guest\.booking\.com/i)?.[1] ??
    tekst.match(/(?:Boekingsnummer|Bevestigingsnummer|Booking number|Confirmation number|Reservation number)\s*:?\s*(\d{8,12})/i)?.[1] ??
    null;

  // "Lorna Lawrence zei:" en daaronder het bericht, tot de knoppen of de reserveringsgegevens.
  let gastNaam: string | null = null;
  const tekstRegels: string[] = [];
  const start = regels.findIndex((r) => /\s(zei|said|schreef|wrote)\s*:\s*$/i.test(" " + r));
  if (start >= 0) {
    gastNaam = regels[start].replace(/\s*(zei|said|schreef|wrote)\s*:\s*$/i, "").trim() || null;
    for (let i = start + 1; i < regels.length; i++) {
      const r = regels[i];
      if (EINDE.test(r)) break;
      tekstRegels.push(r);
    }
  }
  const bericht = tekstRegels.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  const soort = /accepteer gratis|accept for free|afhankelijk van beschikbaarheid/i.test(tekst) ? "verzoek" : "bericht";

  gastNaam = gastNaam ?? naLabel(tekst, "Naam gast|Guest name");
  const accommodatie = naLabel(tekst, "Naam accommodatie|Property name|Accommodation name");
  const aankomst = leesDatum(naLabel(tekst, "Inchecken|Check-in") ?? "");

  // De link naar het gesprek in de Extranet staat over meerdere regels gebroken; aan elkaar plakken.
  const plat = tekst.replace(/\s+/g, "");
  const hotelId = plat.match(/hotel_id=(\d+)/)?.[1] ?? null;
  const antwoordLink = nummer && hotelId
    ? `https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/messaging/inbox.html?hotel_id=${hotelId}&res_id=${nummer}&product_id=${nummer}&lang=nl`
    : null;

  return {
    mail_id: String(mail.id ?? ""),
    ontvangen_op: mail.datum ? new Date(String(mail.datum)).toISOString() : null,
    nummer,
    gast_naam: gastNaam,
    bericht: bericht || null,
    soort,
    accommodatie,
    suite: suiteVan(accommodatie),
    aankomst_datum: aankomst,
    antwoord_link: antwoordLink,
  };
}
