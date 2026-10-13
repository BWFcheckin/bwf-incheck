#!/usr/bin/env node
/*
 * Test van het lezen van Booking.com-gastberichten (supabase/functions/gastberichten-mail/lees.ts).
 * De twee voorbeelden hebben exact de opmaak van de mails van 13-10-2026, maar met een verzonnen
 * gast en nummer: deze repository is openbaar.
 *
 * Draaien:  node --experimental-strip-types tests/gastberichten-lees.test.mjs
 */
import assert from "node:assert/strict";
import { leesBookingMail, leesDatum, suiteVan } from "../supabase/functions/gastberichten-mail/lees.ts";

const verzoek = {
  id: "a1",
  datum: "2026-10-13T13:30:50Z",
  onderwerp: "Wij hebben dit bericht ontvangen van Anna Voorbeeld",
  van: "Anna Voorbeeld <5000000042-abcd.ef12.gh34.ij56@guest.booking.com>",
  tekst: `   Booking.com
   Boekingsnummer: 5000000042

   U heeft een nieuw bericht van een gast

   Anna Voorbeeld zei:
   Ik wil graag om 15:00 - 16:00 inchecken. Is dit mogelijk?
   Accepteer gratis
     __________________________________________________________________

   Accepteer met toeslag
     __________________________________________________________________

   Reserveringsgegevens
   Naam gast: Anna Voorbeeld
   Inchecken: donderdag 22 oktober 2026
   Uitchecken: vrijdag 23 oktober 2026
   Naam accommodatie: Bed & Wellness Angie
   Boekingsnummer: 5000000042
`,
};

const vrij = {
  id: "a2",
  datum: "2026-10-13T13:35:40Z",
  onderwerp: "Wij hebben dit bericht ontvangen van Anna Voorbeeld",
  van: "5000000042-abcd.ef12.gh34.ij56@guest.booking.com",
  tekst: `   ##- Typ een antwoord boven deze lijn -##

                       Bevestigingsnummer: 5000000042

                   U heeft een nieuw bericht van een gast

                             Anna Voorbeeld zei:

                             2 year anniversary

   Beantwoorden

                                     -->
   https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/messaging
   /inbox.html?message_id=0000&from_instan
   t_email=1&lang=nl&product_type=POST_BOOKING&hotel_id=12955821&res_id=50
   00000042&product_id=5000000042

   Reserveringsgegevens

   Naam gast:
   Anna Voorbeeld

   Inchecken:
   do 22 okt 2026

   Naam accommodatie:
   Bed & Wellness Angie

   Boekingsnummer:
   5000000042
`,
};

const a = leesBookingMail(verzoek);
assert.equal(a.nummer, "5000000042");
assert.equal(a.gast_naam, "Anna Voorbeeld");
assert.equal(a.bericht, "Ik wil graag om 15:00 - 16:00 inchecken. Is dit mogelijk?");
assert.equal(a.soort, "verzoek");
assert.equal(a.accommodatie, "Bed & Wellness Angie");
assert.equal(a.suite, "angie");
assert.equal(a.aankomst_datum, "2026-10-22");
assert.equal(a.antwoord_link, null);

const b = leesBookingMail(vrij);
assert.equal(b.nummer, "5000000042");
assert.equal(b.gast_naam, "Anna Voorbeeld");
assert.equal(b.bericht, "2 year anniversary");
assert.equal(b.soort, "bericht");
assert.equal(b.suite, "angie");
assert.equal(b.aankomst_datum, "2026-10-22");
assert.match(b.antwoord_link, /hotel_id=12955821&res_id=5000000042/);

// Engelstalige variant
const en = leesBookingMail({
  id: "a3", van: "5000000043-x@guest.booking.com",
  tekst: "John Smith said:\nCan we bring a cake?\nReply\nReservation details\nCheck-in: Thursday, 5 November 2026\nProperty name: Bed & Wellness Malina Jacuzzi Suite\n",
});
assert.equal(en.gast_naam, "John Smith");
assert.equal(en.bericht, "Can we bring a cake?");
assert.equal(en.aankomst_datum, "2026-11-05");
assert.equal(en.suite, "malina_jacuzzi");

assert.equal(leesDatum("za 3 mrt 2027"), "2027-03-03");
assert.equal(suiteVan("Bed & Wellness Malina"), null);
assert.equal(suiteVan("Malina Deluxe Zwembad Suite"), "malina_deluxe");

console.log("gastberichten-lees: alle controles geslaagd");
