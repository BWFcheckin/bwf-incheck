/* Het membershipprogramma, op één plek.
   ===========================================================================
   Angela, 28-09-2026: members krijgen korting op elke boeking, voordeel op
   extra's, en voorrang bij aanbiedingen. Gratis lidmaatschap, één niveau.

   Waarom een apart bestand: de korting moet op meerdere schermen hetzelfde
   uitvallen - bij het aanmaken van een reservering, op de reserveringskaart en
   in het incheckformulier. Drie keer apart uitrekenen is drie kansen om uit de
   pas te lopen, en juist bij bedragen merkt een gast dat meteen.

   Gebruik:
     await BWFMember.laad(haalFunctie);        // eenmalig bij het opstarten
     const k = BWFMember.bereken({ kamer: 300, extras: [{naam:'Bier', bedrag:6}] });
     k.korting   -> het kortingsbedrag
     k.totaal    -> wat de gast betaalt
     k.regels    -> uitleg per regel, om aan de gast te tonen

   `haalFunctie` is een functie die een PostgREST-pad aanneemt en de rijen
   teruggeeft. Elke pagina heeft er al een (api, sb, haal, sbGet); zo hoeft dit
   bestand niets te weten van sleutels en sessies.
*/
(function (global) {
  "use strict";

  /* Standaard: geen korting. Zolang de regels niet geladen zijn rekent er dus
     niets - beter dan een verzonnen percentage dat de gast te zien krijgt. */
  var REGELS = {
    korting: 0,
    over: "kamer",
    gratisExtras: [],
    voorwaarden: "",
    nummerStart: 1001,
    geladen: false
  };

  function getal(v) {
    var n = parseFloat(String(v == null ? "" : v).replace(",", "."));
    return isNaN(n) ? 0 : n;
  }

  /* Namen vergelijken zonder over hoofdletters en spaties te struikelen:
     "Late check-out" en "late checkout" horen hetzelfde te zijn. */
  function sleutel(naam) {
    return String(naam || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function leesRegels(rijen) {
    var m = {};
    (rijen || []).forEach(function (r) { if (r && r.sleutel) m[r.sleutel] = r.waarde; });
    REGELS.korting = Math.max(0, Math.min(100, getal(m.member_korting_procent)));
    REGELS.over = m.member_korting_over === "alles" ? "alles" : "kamer";
    REGELS.gratisExtras = String(m.member_gratis_extras || "")
      .split(/\s*[\n;]\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
    REGELS.voorwaarden = m.member_voorwaarden || "";
    REGELS.nummerStart = getal(m.member_nummer_start) || 1001;
    REGELS.geladen = true;
    return REGELS;
  }

  /* De vijf instellingen ophalen. Mislukt dat, dan blijft de korting op nul en
     blijft de pagina gewoon werken; er wordt niet geraden. */
  function laad(haal) {
    if (typeof haal !== "function") return Promise.resolve(REGELS);
    var pad = "instellingen?select=sleutel,waarde&sleutel=like.member\\_*";
    return Promise.resolve(haal(pad)).then(leesRegels, function () {
      REGELS.geladen = false;
      return REGELS;
    });
  }

  function regels() { return REGELS; }
  function actief() { return REGELS.korting > 0 || REGELS.gratisExtras.length > 0; }

  /* Is deze extra gratis voor members? */
  function isGratisExtra(naam) {
    var s = sleutel(naam);
    if (!s) return false;
    return REGELS.gratisExtras.some(function (x) { return sleutel(x) === s; });
  }

  /* Is deze klant op dit moment lid?
     Let op member_gestopt: iemand kan het vinkje nog aan hebben staan uit een
     oude registratie terwijl het lidmaatschap is beëindigd. De stopdatum wint,
     maar alleen als die al voorbij is - een datum in de toekomst betekent dat
     het lidmaatschap nog loopt. */
  function isLid(klant, opDatum) {
    if (!klant) return false;
    var lid = klant.member === true || klant.member === "true" || klant.member === 1;
    if (!lid) return false;
    var gestopt = klant.member_gestopt || klant.memberGestopt || "";
    if (!gestopt) return true;
    var peil = opDatum || vandaag();
    return String(gestopt) > String(peil);
  }

  function vandaag() {
    /* Lokale datum, niet UTC: met toISOString() staat er tussen middernacht en
       02:00 de dag ervoor. Die fout zat eerder op acht plekken in dit project. */
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
      "-" + String(d.getDate()).padStart(2, "0");
  }

  /* Afronden op centen. Zonder dit levert 300 * 0,1 soms 30.000000000000004 op
     en staat er een bedrag met twaalf decimalen op het scherm. */
  function cent(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  /* De kern: wat betaalt een member voor deze boeking?

     invoer:
       kamer   het bedrag voor de kamer, vóór korting
       extras  lijst van { naam, bedrag, aantal } - aantal mag ontbreken

     uitvoer:
       kamer, extras   de bedragen ná aftrek
       korting         wat er in totaal af gaat
       totaal          wat de gast betaalt
       regels          per voordeel een zin, om aan de gast te laten zien
       gratis          de namen van de extra's die op nul zijn gezet
  */
  function bereken(invoer) {
    invoer = invoer || {};
    var kamer = cent(getal(invoer.kamer));
    var lijst = Array.isArray(invoer.extras) ? invoer.extras : [];
    var uitleg = [], gratis = [], kortingKamer = 0, kortingExtras = 0, weggevallen = 0;

    /* Eerst de gratis extra's eruit halen. Dat gebeurt vóór de procentuele
       korting, anders zou je korting rekenen over iets wat de gast toch al
       gratis krijgt - en dan lijkt het voordeel groter dan het is. */
    var naExtras = lijst.map(function (x) {
      var aantal = getal(x && x.aantal) || 1;
      var bedrag = cent(getal(x && x.bedrag) * aantal);
      if (isGratisExtra(x && x.naam)) {
        weggevallen += bedrag;
        gratis.push(String(x.naam));
        return { naam: x && x.naam, bedrag: 0, aantal: aantal, gratisVoorMember: true, was: bedrag };
      }
      return { naam: x && x.naam, bedrag: bedrag, aantal: aantal, gratisVoorMember: false, was: bedrag };
    });

    var extrasSom = naExtras.reduce(function (s, x) { return s + x.bedrag; }, 0);

    if (REGELS.korting > 0) {
      kortingKamer = cent(kamer * REGELS.korting / 100);
      if (REGELS.over === "alles") kortingExtras = cent(extrasSom * REGELS.korting / 100);
      uitleg.push(REGELS.korting + "% korting op " +
        (REGELS.over === "alles" ? "de hele boeking" : "de kamerprijs"));
    }
    gratis.forEach(function (n) { uitleg.push(n + " gratis"); });

    var korting = cent(kortingKamer + kortingExtras + weggevallen);
    return {
      lid: true,
      kamer: cent(kamer - kortingKamer),
      kamerVoor: kamer,
      extras: naExtras,
      extrasSom: cent(extrasSom - kortingExtras),
      korting: korting,
      kortingKamer: cent(kortingKamer),
      kortingExtras: cent(kortingExtras),
      gratisWaarde: cent(weggevallen),
      totaal: cent(kamer - kortingKamer + extrasSom - kortingExtras),
      regels: uitleg,
      gratis: gratis
    };
  }

  /* Wat een niet-lid betaalt, in dezelfde vorm. Zo kan een scherm allebei
     langs elkaar zetten zonder twee soorten uitkomsten te hoeven kennen. */
  function zonderLidmaatschap(invoer) {
    invoer = invoer || {};
    var kamer = cent(getal(invoer.kamer));
    var lijst = (Array.isArray(invoer.extras) ? invoer.extras : []).map(function (x) {
      var aantal = getal(x && x.aantal) || 1;
      var bedrag = cent(getal(x && x.bedrag) * aantal);
      return { naam: x && x.naam, bedrag: bedrag, aantal: aantal, gratisVoorMember: false, was: bedrag };
    });
    var som = lijst.reduce(function (s, x) { return s + x.bedrag; }, 0);
    return { lid: false, kamer: kamer, kamerVoor: kamer, extras: lijst, extrasSom: cent(som),
      korting: 0, kortingKamer: 0, kortingExtras: 0, gratisWaarde: 0,
      totaal: cent(kamer + som), regels: [], gratis: [] };
  }

  /* Eén ingang die zelf kijkt of de klant lid is. */
  function voor(klant, invoer) {
    return isLid(klant) ? bereken(invoer) : zonderLidmaatschap(invoer);
  }

  /* Het eerstvolgende vrije lidnummer, uit de nummers die al vergeven zijn.
     Berekend uit wat er staat en niet uit een aparte teller: zo kan een teller
     nooit uit de pas lopen met de werkelijkheid. */
  function volgendNummer(klanten) {
    var hoog = REGELS.nummerStart - 1;
    (klanten || []).forEach(function (k) {
      var n = parseInt(String((k && (k.member_nummer || k.memberNummer)) || "")
        .replace(/\D/g, ""), 10);
      if (!isNaN(n) && n > hoog) hoog = n;
    });
    return String(hoog + 1);
  }

  global.BWFMember = {
    laad: laad,
    leesRegels: leesRegels,
    regels: regels,
    actief: actief,
    isLid: isLid,
    isGratisExtra: isGratisExtra,
    bereken: bereken,
    zonderLidmaatschap: zonderLidmaatschap,
    voor: voor,
    volgendNummer: volgendNummer,
    vandaag: vandaag
  };
})(typeof window !== "undefined" ? window : this);
