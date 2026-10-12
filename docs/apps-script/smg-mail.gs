/**
 * BWF · SMG-mails naar het dashboard
 *
 * Stuurt de mails "Verhuur-oke? #nummer" en "Bevestiging #nummer" van Privésauna (Special Moments
 * Group) naar de Supabase-functie smg-mail, die de bedragen bij de reservering zet. Verwerkte mails
 * krijgen het label "SMG-verwerkt".
 *
 * Installeren: zie docs/SMG-MAIL-INSTALLATIE.md. De sleutel staat NIET in dit bestand maar in
 * Projectinstellingen → Scripteigenschappen, onder de naam SMG_MAIL_TOKEN.
 *
 * Functies die je zelf start:
 *   proefrunOudeMails()   alle oude mails nalopen, niets schrijven; overzicht in een Google Sheet
 *   verwerkOudeMails()    hetzelfde, maar nu echt (pas na akkoord op de proefrun)
 *   zetTriggerAan()       elke 10 minuten nieuwe mails verwerken
 *   opnieuwBeginnen()     de teller van een afgebroken proefrun of verwerking terugzetten
 */

var SMG_URL = 'https://iuyjvtlauktnjprbmbjj.supabase.co/functions/v1/smg-mail';
var SMG_LABEL = 'SMG-verwerkt';
var SMG_ZOEK = 'from:mg.specialmoments.group {subject:"Verhuur-oke" subject:"Bevestiging #"}';
var SMG_PER_KEER = 20;          // draden per aanroep van de functie
var SMG_MAX_SECONDEN = 270;     // Apps Script stopt na 6 minuten; ruim daarvoor ophouden
/* true: bij een reservering die met de hand is gewijzigd en waarvan het totaal klopt met de mail,
   mogen servicekosten en arrangementen wel worden aangevuld. Bedragen blijven altijd staan, en
   arrangementen worden niet aangevuld als ze al bij de reservering staan (niet dubbel). */
var SMG_NIEUWE_VELDEN = true;   // akkoord Angela 12-10-2026

/** Elke 10 minuten (via de trigger): nieuwe mails zonder label verwerken. */
function verwerkNieuweSmgMails() {
  var label = smgLabel_();
  var draden = GmailApp.search(SMG_ZOEK + ' -label:' + SMG_LABEL + ' newer_than:30d', 0, SMG_PER_KEER);
  if (!draden.length) return;
  var uit = smgStuur_(draden, false);
  if (uit) draden.forEach(function (d) { d.addLabel(label); });
}

/** Eenmalig: alle oude mails nalopen zonder iets te schrijven. Het overzicht komt in een Google Sheet. */
function proefrunOudeMails() { smgOud_(true); }

/** Eenmalig, na akkoord op de proefrun: alle oude mails echt verwerken en labelen. */
function verwerkOudeMails() { smgOud_(false); }

function opnieuwBeginnen() {
  var p = PropertiesService.getScriptProperties();
  p.deleteProperty('SMG_OUD_START');
  p.deleteProperty('SMG_OUD_SHEET');
  Logger.log('Teller teruggezet.');
}

function zetTriggerAan() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'verwerkNieuweSmgMails') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('verwerkNieuweSmgMails').timeBased().everyMinutes(10).create();
  Logger.log('Trigger staat aan: elke 10 minuten.');
}

/* ---------- intern ---------- */

function smgOud_(proef) {
  var begin = Date.now();
  var p = PropertiesService.getScriptProperties();
  var sleutel = proef ? 'proef' : 'echt';
  var start = 0;
  var stand = (p.getProperty('SMG_OUD_START') || '').split(':');
  if (stand[0] === sleutel) start = Number(stand[1]) || 0;

  var blad = smgBlad_(p, proef, start === 0);
  var label = smgLabel_();
  // Bij de echte verwerking krijgen mails een label en vallen ze uit de zoekopdracht: dan telkens vanaf 0.
  var zoek = proef ? SMG_ZOEK : SMG_ZOEK + ' -label:' + SMG_LABEL;

  while ((Date.now() - begin) / 1000 < SMG_MAX_SECONDEN) {
    var draden = GmailApp.search(zoek, proef ? start : 0, SMG_PER_KEER);
    if (!draden.length) {
      p.deleteProperty('SMG_OUD_START');
      Logger.log('Klaar. Overzicht: ' + blad.getParent().getUrl());
      return;
    }
    var uit = smgStuur_(draden, proef);
    if (!uit) { Logger.log('Gestopt na een fout; start de functie opnieuw om verder te gaan.'); return; }
    uit.resultaten.forEach(function (r) {
      var m = r.mail || {}, d = r.dashboard || {};
      blad.appendRow([r.nummer || '', r.soort || '', r.uitkomst || '', r.toelichting || '', r.suite || '', r.aankomst || '',
        m.totaal, m.betaald, m.te_betalen, m.servicekosten, d.totaal, d.betaald, d.restant, d.bron || '',
        d.handmatig === true ? 'ja' : '', r.kan_extra === true ? 'ja' : '', r.mail_id || '']);
    });
    if (!proef) draden.forEach(function (d) { d.addLabel(label); });
    start += draden.length;
    p.setProperty('SMG_OUD_START', sleutel + ':' + start);
  }
  Logger.log('Tijd op na ' + start + ' draden. Start de functie opnieuw om verder te gaan. Overzicht tot nu toe: ' +
    blad.getParent().getUrl());
}

/** Stuurt de mails van deze draden naar smg-mail. Geeft het antwoord terug, of null bij een fout. */
function smgStuur_(draden, proef) {
  var token = PropertiesService.getScriptProperties().getProperty('SMG_MAIL_TOKEN');
  if (!token) throw new Error('Scripteigenschap SMG_MAIL_TOKEN ontbreekt (Projectinstellingen → Scripteigenschappen).');
  var mails = [];
  draden.forEach(function (draad) {
    draad.getMessages().forEach(function (b) {
      mails.push({
        id: b.getId(),
        datum: b.getDate().toISOString(),
        onderwerp: b.getSubject(),
        van: b.getFrom(),
        tekst: b.getPlainBody().slice(0, 20000)
      });
    });
  });
  if (!mails.length) return { resultaten: [] };
  var antwoord = UrlFetchApp.fetch(SMG_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-smg-token': token },
    payload: JSON.stringify({ proef: proef, nieuwe_velden: SMG_NIEUWE_VELDEN, mails: mails }),
    muteHttpExceptions: true
  });
  if (antwoord.getResponseCode() !== 200) {
    Logger.log('smg-mail gaf ' + antwoord.getResponseCode() + ': ' + antwoord.getContentText().slice(0, 300));
    return null;
  }
  var uit = JSON.parse(antwoord.getContentText());
  Logger.log((proef ? 'proef ' : '') + JSON.stringify(uit.telling));
  return uit;
}

function smgLabel_() {
  return GmailApp.getUserLabelByName(SMG_LABEL) || GmailApp.createLabel(SMG_LABEL);
}

function smgBlad_(p, proef, nieuw) {
  var id = p.getProperty('SMG_OUD_SHEET');
  var boek = null;
  if (id && !nieuw) { try { boek = SpreadsheetApp.openById(id); } catch (e) { boek = null; } }
  if (!boek) {
    boek = SpreadsheetApp.create('SMG-mails ' + (proef ? 'proefrun' : 'verwerkt') + ' ' +
      Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'yyyy-MM-dd HH:mm'));
    boek.getSheets()[0].appendRow(['nummer', 'soort mail', 'uitkomst', 'toelichting', 'suite', 'aankomst',
      'mail totaal', 'mail betaald', 'mail te betalen', 'mail servicekosten',
      'dashboard totaal', 'dashboard betaald', 'dashboard restant', 'bedragen van', 'handmatig gewijzigd',
      'kan servicekosten/arrangementen aanvullen', 'mail-id']);
    p.setProperty('SMG_OUD_SHEET', boek.getId());
  }
  return boek.getSheets()[0];
}
