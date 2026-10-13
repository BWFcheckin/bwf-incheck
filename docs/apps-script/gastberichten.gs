/**
 * BWF · Gastberichten van Booking.com naar het dashboard
 *
 * Stuurt de mails die Booking.com doorstuurt als een gast iets vraagt of meldt
 * (afzender <nummer>-…@guest.booking.com) naar de Supabase-functie gastberichten-mail.
 * Die zet het bericht bij de juiste reservering in het dashboard. Verwerkte mails krijgen
 * het label "Gastbericht-verwerkt". De mail zelf blijft gewoon in je inbox staan.
 *
 * Installeren: zie docs/GASTBERICHTEN-INSTALLATIE.md. De sleutel staat NIET in dit bestand maar in
 * Projectinstellingen → Scripteigenschappen, onder de naam GASTBERICHTEN_TOKEN.
 *
 * Functies die je zelf start:
 *   proefrun()             de berichten van de laatste 30 dagen nalopen, niets schrijven (zie logboek)
 *   verwerkRecent()        hetzelfde, maar nu echt
 *   zetTriggerAan()        elke 5 minuten nieuwe berichten verwerken
 */

var GB_URL = 'https://iuyjvtlauktnjprbmbjj.supabase.co/functions/v1/gastberichten-mail';
var GB_LABEL = 'Gastbericht-verwerkt';
var GB_ZOEK = 'from:guest.booking.com';
var GB_PER_KEER = 25;

/** Elke 5 minuten (via de trigger): nieuwe berichten zonder label verwerken. */
function verwerkNieuweGastberichten() {
  var draden = GmailApp.search(GB_ZOEK + ' -label:' + GB_LABEL + ' newer_than:14d', 0, GB_PER_KEER);
  if (!draden.length) return;
  var uit = gbStuur_(draden, false);
  if (uit) gbLabel_(draden, uit);
}

/** De laatste 30 dagen nalopen zonder iets te schrijven. Het resultaat staat in het uitvoeringslogboek. */
function proefrun() {
  var draden = GmailApp.search(GB_ZOEK + ' newer_than:30d', 0, 100);
  if (!draden.length) { Logger.log('Geen Booking.com-gastberichten gevonden in de laatste 30 dagen.'); return; }
  var uit = gbStuur_(draden, true);
  if (!uit) return;
  uit.resultaten.forEach(function (r) {
    if (!r.mail_id) return;
    Logger.log([r.nummer || '-', r.uitkomst, r.gekoppeld_via || '', r.suite || '', r.aankomst || '', r.soort || '', r.toelichting || ''].join(' | '));
  });
}

/** Na een goede proefrun: de laatste 30 dagen echt verwerken. */
function verwerkRecent() {
  var draden = GmailApp.search(GB_ZOEK + ' -label:' + GB_LABEL + ' newer_than:30d', 0, 100);
  for (var i = 0; i < draden.length; i += GB_PER_KEER) {
    var deel = draden.slice(i, i + GB_PER_KEER);
    var uit = gbStuur_(deel, false);
    if (!uit) { Logger.log('Gestopt na een fout; start de functie opnieuw.'); return; }
    gbLabel_(deel, uit);
  }
  Logger.log('Klaar: ' + draden.length + ' gesprek(ken) verwerkt.');
}

function zetTriggerAan() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'verwerkNieuweGastberichten') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('verwerkNieuweGastberichten').timeBased().everyMinutes(5).create();
  Logger.log('Trigger staat aan: elke 5 minuten.');
}

/* ---------- intern ---------- */

/* Een gesprek met Booking.com is één Gmail-draad; een nieuw bericht van de gast komt in dezelfde
   draad. Daarom stuurt dit script altijd alle mails van de draad mee: wat al verwerkt is, slaat de
   database over (elke mail maar één keer). */
function gbStuur_(draden, proef) {
  var token = PropertiesService.getScriptProperties().getProperty('GASTBERICHTEN_TOKEN');
  if (!token) throw new Error('Scripteigenschap GASTBERICHTEN_TOKEN ontbreekt (Projectinstellingen → Scripteigenschappen).');
  var mails = [];
  draden.forEach(function (draad) {
    draad.getMessages().forEach(function (b) {
      if (!/@guest\.booking\.com/i.test(b.getFrom())) return; // je eigen antwoorden niet
      mails.push({
        id: b.getId(),
        datum: b.getDate().toISOString(),
        onderwerp: b.getSubject(),
        van: b.getFrom(),
        tekst: b.getPlainBody().slice(0, 20000)
      });
    });
  });
  var antwoord = UrlFetchApp.fetch(GB_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-gastberichten-token': token },
    payload: JSON.stringify({ proef: proef, mails: mails }),
    muteHttpExceptions: true
  });
  if (antwoord.getResponseCode() !== 200) {
    Logger.log('gastberichten-mail gaf ' + antwoord.getResponseCode() + ': ' + antwoord.getContentText().slice(0, 300));
    return null;
  }
  var uit = JSON.parse(antwoord.getContentText());
  Logger.log((proef ? 'proef ' : '') + JSON.stringify(uit.telling));
  return uit;
}

function gbLabel_(draden) {
  var label = GmailApp.getUserLabelByName(GB_LABEL) || GmailApp.createLabel(GB_LABEL);
  draden.forEach(function (d) { d.addLabel(label); });
}
