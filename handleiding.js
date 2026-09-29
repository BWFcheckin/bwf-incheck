/* ============================================================
   BWF — Locatiemanager handleiding
   ------------------------------------------------------------
   Losse module naast het bestaande dashboard. Raakt geen andere
   pagina, geen reserveringen en geen databasetabellen.

   HOE HET WERKT
   - Alle tekst staat in één datastructuur (STANDAARD_HANDLEIDING
     hieronder). De pagina tekent zichzelf uit die data.
   - Aanpassen doe je op de pagina zelf, via "Handleiding aanpassen"
     (alleen zichtbaar voor de eigenaar).
   - Opslaan en laden gaat via twee functies:
         loadHandleidingData()   en   saveHandleidingData(data)
     Nu gebruiken die localStorage + het bestand handleiding-data.json.
     Wil je later naar Supabase, dan vervang je alleen die twee.

   WAAR KOMT DE TEKST VANDAAN (in deze volgorde)
   1. Wijzigingen die op DIT apparaat zijn opgeslagen (localStorage)
   2. handleiding-data.json in de repo  = de gepubliceerde versie
      die alle medewerkers zien
   3. De standaardtekst hieronder
   ============================================================ */
(function () {
  "use strict";

  var OPSLAG_SLEUTEL = "bwf-handleiding-data";
  var CHECK_SLEUTEL = "bwf-handleiding-checklist";
  var GEPUBLICEERD_BESTAND = "handleiding-data.json";

  /* Dezelfde publieke gegevens als in bwf-menu.js; alleen gebruikt om de
     rol op te vragen (eigenaar ziet de beheerpagina). */
  var SUPABASE_URL = "https://iuyjvtlauktnjprbmbjj.supabase.co";
  var SUPABASE_KEY = "sb_publishable_SfQjQTwKa3BgCtjwE-8ljw_mTpqEY3U";

  /* ------------------------------------------------------------
     STANDAARDINHOUD
     type bepaalt hoe een sectie getekend wordt:
       lijst | kaarten | workflow | checklist | team | contact
     status: normaal | actie | spoed
     ------------------------------------------------------------ */
  var STANDAARD_HANDLEIDING = {
    versie: 1,
    meta: {
      titel: "Locatiemanager werkinstructie",
      subtitel: "Reserveringen • Check-in • Agenda • Communicatie • Dagelijkse werkwijze",
      terugUrl: "dashboard.html"
    },
    statussen: {
      normaal: { label: "Normaal", uitleg: "Normale dagelijkse werkzaamheden." },
      actie: { label: "Actie", uitleg: "Iets controleren, uitvoeren of opvolgen." },
      spoed: { label: "Spoed", uitleg: "Direct actie of contact nodig." }
    },
    secties: [
      {
        id: "dagstart", icoon: "🌅", titel: "Dagstart", type: "lijst", status: "normaal",
        intro: "Begin iedere dienst met deze controles, in deze volgorde.",
        items: [
          "Agenda controleren",
          "Aankomsten controleren",
          "Vertrekken controleren",
          "Nieuwe reserveringen controleren",
          "Wijzigingen controleren",
          "Annuleringen controleren",
          "Welkomstcalls controleren",
          "Openstaande acties controleren",
          "Bijzonderheden controleren"
        ]
      },
      {
        id: "reserveringen", icoon: "📅", titel: "Reserveringen", type: "kaarten", status: "normaal",
        intro: "Elke reservering controleer je op drie punten: de gegevens, de bron en het dashboard.",
        link: { label: "Open reserveringen", url: "reserveringen.html" },
        kaarten: [
          {
            icoon: "🔍", titel: "Gegevens controleren", status: "actie",
            tekst: "Loop bij elke reservering deze gegevens na:",
            lijst: ["Naam", "Aankomst", "Vertrek", "Aantal personen", "Accommodatie", "Prijs", "Extra's", "Opmerkingen"]
          },
          {
            icoon: "🌐", titel: "Bron controleren", status: "normaal",
            tekst: "De oorspronkelijke reserveringsbron is leidend. Staat er in het dashboard iets anders dan bij de bron, dan geldt wat bij de bron staat.",
            lijst: []
          },
          {
            icoon: "💾", titel: "Dashboard controleren", status: "actie",
            tekst: "Controleer of de gegevens correct in het dashboard staan. Klopt iets niet, pas het aan of geef het door aan de locatieverantwoordelijke.",
            lijst: []
          }
        ]
      },
      {
        id: "nieuwe-reservering", icoon: "➕", titel: "Nieuwe reservering", type: "workflow", status: "actie",
        intro: "Zo verwerk je een nieuwe reservering van begin tot eind.",
        stappen: [
          { titel: "Reservering ontvangen", tekst: "" },
          { titel: "Bron controleren", tekst: "De oorspronkelijke bron is leidend." },
          { titel: "Gegevens controleren", tekst: "Naam, data, personen, accommodatie, prijs." },
          { titel: "Dashboard controleren", tekst: "Staat alles goed in het dashboard?" },
          { titel: "Eventuele extra's controleren", tekst: "" },
          { titel: "Welkomstcall uitvoeren indien nodig", tekst: "" },
          { titel: "Reservering volledig verwerken", tekst: "" }
        ]
      },
      {
        id: "welkomstcall", icoon: "📞", titel: "Welkomstcall", type: "workflow", status: "actie",
        intro: "Een persoonlijk gesprek met de gast vóór aankomst.",
        stappen: [
          { titel: "Reservering openen", tekst: "" },
          { titel: "Gegevens controleren", tekst: "" },
          { titel: "Gast bellen", tekst: "" },
          { titel: "Gast welkom heten", tekst: "" },
          { titel: "Belangrijke informatie controleren", tekst: "Aankomsttijd, aantal personen, extra's." },
          { titel: "Bijzonderheden bespreken", tekst: "Wensen, allergieën, speciale gelegenheid." },
          { titel: "Uitkomst registreren", tekst: "" }
        ]
      },
      {
        id: "inchecken", icoon: "🛎️", titel: "Inchecken", type: "kaarten", status: "normaal",
        intro: "Bij aankomst van de gast loop je deze vier onderdelen langs.",
        link: { label: "Open incheckformulier", url: "incheckformulier.html" },
        kaarten: [
          { icoon: "📋", titel: "Check-in formulier", status: "normaal", tekst: "Controleer het incheckformulier of laat de gast het invullen en ondertekenen.", lijst: [] },
          { icoon: "➕", titel: "Extra's", status: "normaal", tekst: "Controleer welke extra's geboekt zijn en of die klaarstaan.", lijst: [] },
          { icoon: "💳", titel: "Betaling", status: "actie", tekst: "Controleer of alles betaald is. Staat er nog iets open, zorg dat het wordt afgerond of noteer het als openstaande actie.", lijst: [] },
          { icoon: "📝", titel: "Bijzonderheden", status: "normaal", tekst: "Noteer wensen, allergieën en andere bijzonderheden.", lijst: [] }
        ]
      },
      {
        id: "agenda", icoon: "🗓️", titel: "Agenda", type: "kaarten", status: "normaal",
        intro: "In de agenda let je op deze zes onderdelen. Controleer ze bij de dagstart en aan het einde van je dienst.",
        link: { label: "Open locatiedashboard", url: "dashboard.html" },
        kaarten: [
          { icoon: "🟢", titel: "Aankomsten", status: "normaal", tekst: "Wie komt er vandaag en morgen aan?", lijst: [] },
          { icoon: "🚪", titel: "Vertrekken", status: "normaal", tekst: "Wie vertrekt er en hoe laat?", lijst: [] },
          { icoon: "🏠", titel: "Bezetting", status: "normaal", tekst: "Welke suites zijn bezet?", lijst: [] },
          { icoon: "📭", titel: "Openstaande beschikbaarheid", status: "normaal", tekst: "Welke data zijn nog vrij?", lijst: [] },
          { icoon: "📝", titel: "Bijzonderheden", status: "actie", tekst: "Zijn er opmerkingen of wensen die aandacht vragen?", lijst: [] },
          { icoon: "✏️", titel: "Wijzigingen", status: "actie", tekst: "Is er sinds je vorige dienst iets veranderd?", lijst: [] }
        ]
      },
      {
        id: "agenda-sluiten", icoon: "🔒", titel: "Agenda sluiten", type: "workflow", status: "actie",
        intro: "Een datum of suite dichtzetten zodat er geen dubbele boekingen ontstaan.",
        notitie: {
          status: "actie",
          tekst: "Het dashboard sluit de beschikbaarheid op partnerplatforms niet automatisch. Sluit de datum zelf in het beheer van elk platform waar de suite online staat. Twijfel je, overleg dan met de locatieverantwoordelijke."
        },
        stappen: [
          { titel: "Bezetting controleren", tekst: "" },
          { titel: "Beschikbaarheid controleren", tekst: "" },
          { titel: "Partnerplatform controleren", tekst: "Op elk platform waar de suite online staat." },
          { titel: "Beschikbaarheid sluiten indien nodig", tekst: "Handmatig, per platform." },
          { titel: "Dashboard controleren", tekst: "" }
        ]
      },
      {
        id: "wijzigen", icoon: "✏️", titel: "Reservering wijzigen", type: "workflow", status: "actie",
        intro: "Een gast wil iets veranderen, of een platform geeft een wijziging door.",
        stappen: [
          { titel: "Bron controleren", tekst: "" },
          { titel: "Wijziging vaststellen", tekst: "" },
          { titel: "Dashboard aanpassen", tekst: "" },
          { titel: "Gegevens opnieuw controleren", tekst: "" },
          { titel: "Welkomstcall opnieuw controleren indien nodig", tekst: "" }
        ]
      },
      {
        id: "annulering", icoon: "❌", titel: "Annulering", type: "workflow", status: "actie",
        intro: "Een reservering is geannuleerd.",
        stappen: [
          { titel: "Annulering bij bron controleren", tekst: "" },
          { titel: "Dashboard bijwerken", tekst: "" },
          { titel: "Beschikbaarheid controleren", tekst: "" },
          { titel: "Eventuele acties afronden", tekst: "" }
        ]
      },
      {
        id: "spoed", icoon: "🚨", titel: "Spoed & bijzonderheden", type: "kaarten", status: "spoed",
        intro: "Bij spoed of een bijzondere situatie direct contact opnemen met de locatieverantwoordelijke.",
        kaarten: [
          { icoon: "💬", titel: "WhatsApp", status: "normaal", tekst: "Voor normale communicatie en afstemming.", lijst: [] },
          { icoon: "📞", titel: "Telefoon", status: "spoed", tekst: "Bij spoed, of wanneer snel overleg noodzakelijk is.", lijst: [] }
        ]
      },
      {
        id: "team", icoon: "👥", titel: "Wie werkt wanneer", type: "team", status: "normaal",
        intro: "Overzicht van het team op de locatie.",
        leden: []
      },
      {
        id: "contact", icoon: "💬", titel: "Contact met locatie", type: "contact", status: "normaal",
        intro: "WhatsApp is voor normale afstemming. Bel bij spoed of bijzonderheden.",
        kanalen: [
          { type: "whatsapp", label: "WhatsApp", waarde: "", gebruik: "Normale afstemming", status: "normaal" },
          { type: "telefoon", label: "Telefoon", waarde: "", gebruik: "Spoed en bijzonderheden", status: "spoed" },
          { type: "email", label: "E-mail", waarde: "", gebruik: "Niet-dringende zaken en documenten", status: "normaal" }
        ]
      },
      {
        id: "checklist", icoon: "☑️", titel: "Dagelijkse checklist", type: "checklist", status: "actie",
        intro: "Vink af wat je gedaan hebt. De checklist wordt per dag op dit apparaat bewaard.",
        items: [
          "Agenda gecontroleerd",
          "Nieuwe reserveringen gecontroleerd",
          "Gegevens bij de bron gecontroleerd",
          "Welkomstcalls gecontroleerd",
          "Openstaande acties gecontroleerd",
          "Bijzonderheden gecontroleerd",
          "Openstaande acties overgedragen",
          "Agenda opnieuw gecontroleerd",
          "Bijzonderheden doorgegeven"
        ]
      }
    ]
  };

  /* Welke velden de beheerpagina per type laat zien. */
  var TYPES = {
    lijst: { naam: "Lijst", veld: "items", enkel: true, label: "Punt" },
    checklist: { naam: "Checklist", veld: "items", enkel: true, label: "Checklist-item" },
    workflow: {
      naam: "Workflow (stappen)", veld: "stappen", label: "Stap",
      velden: [{ k: "titel", label: "Titel" }, { k: "tekst", label: "Toelichting (mag leeg)", soort: "tekstvak" }],
      leeg: { titel: "", tekst: "" }
    },
    kaarten: {
      naam: "Kaarten", veld: "kaarten", label: "Kaart",
      velden: [
        { k: "icoon", label: "Icoon", klein: true },
        { k: "titel", label: "Titel" },
        { k: "status", label: "Status", soort: "status" },
        { k: "tekst", label: "Tekst", soort: "tekstvak" },
        { k: "lijst", label: "Opsomming (één punt per regel, mag leeg)", soort: "regels" }
      ],
      leeg: { icoon: "📌", titel: "", status: "normaal", tekst: "", lijst: [] }
    },
    team: {
      naam: "Team", veld: "leden", label: "Medewerker",
      velden: [
        { k: "naam", label: "Medewerker" },
        { k: "functie", label: "Functie" },
        { k: "werkdagen", label: "Werkdagen" },
        { k: "werktijden", label: "Werktijden" },
        { k: "locatie", label: "Locatie" },
        { k: "verantwoordelijkheden", label: "Verantwoordelijkheden", soort: "tekstvak" }
      ],
      leeg: { naam: "", functie: "", werkdagen: "", werktijden: "", locatie: "", verantwoordelijkheden: "" }
    },
    contact: {
      naam: "Contact", veld: "kanalen", label: "Contactmogelijkheid",
      velden: [
        { k: "type", label: "Soort", soort: "keuze", opties: [["whatsapp", "WhatsApp"], ["telefoon", "Telefoon"], ["email", "E-mail"]] },
        { k: "label", label: "Naam op de knop" },
        { k: "waarde", label: "Nummer of adres" },
        { k: "gebruik", label: "Wanneer gebruiken" },
        { k: "status", label: "Status", soort: "status" }
      ],
      leeg: { type: "whatsapp", label: "", waarde: "", gebruik: "", status: "normaal" }
    }
  };

  /* ------------------------------------------------------------
     HULPJES
     ------------------------------------------------------------ */
  function kloon(o) { return JSON.parse(JSON.stringify(o)); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (html != null) e.innerHTML = html;
    return e;
  }

  function vandaag() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function geldig(d) {
    return d && typeof d === "object" && Array.isArray(d.secties) && d.meta && d.statussen;
  }

  function melding(tekst, soort) {
    var m = $("#hlMelding");
    if (!m) return;
    m.textContent = tekst;
    m.className = "hl-melding zichtbaar " + (soort || "");
    clearTimeout(melding._t);
    melding._t = setTimeout(function () { m.className = "hl-melding"; }, 3200);
  }

  /* ------------------------------------------------------------
     OPSLAG — vervang deze twee functies later door database/API
     ------------------------------------------------------------ */

  /* Geeft een Promise met { data, bron }.
     bron = "lokaal" | "gepubliceerd" | "standaard" */
  function loadHandleidingData() {
    try {
      var ruw = localStorage.getItem(OPSLAG_SLEUTEL);
      if (ruw) {
        var lokaal = JSON.parse(ruw);
        if (geldig(lokaal)) return Promise.resolve({ data: lokaal, bron: "lokaal" });
      }
    } catch (e) { /* kapotte opslag: negeren en doorvallen */ }

    return fetch(GEPUBLICEERD_BESTAND + "?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (geldig(d)) return { data: d, bron: "gepubliceerd" };
        return { data: kloon(STANDAARD_HANDLEIDING), bron: "standaard" };
      })
      .catch(function () { return { data: kloon(STANDAARD_HANDLEIDING), bron: "standaard" }; });
  }

  /* Geeft een Promise. Nu: localStorage op dit apparaat. */
  function saveHandleidingData(data) {
    return new Promise(function (ok, fout) {
      try {
        localStorage.setItem(OPSLAG_SLEUTEL, JSON.stringify(data));
        ok();
      } catch (e) { fout(e); }
    });
  }

  function wisLokaleHandleidingData() {
    try { localStorage.removeItem(OPSLAG_SLEUTEL); } catch (e) {}
  }

  /* Checklist: per sectie, per dag. */
  function laadAfgevinkt(sectieId) {
    try {
      var alles = JSON.parse(localStorage.getItem(CHECK_SLEUTEL) || "{}");
      var s = alles[sectieId];
      if (s && s.datum === vandaag()) return s.afgevinkt || {};
    } catch (e) {}
    return {};
  }

  function bewaarAfgevinkt(sectieId, afgevinkt) {
    try {
      var alles = JSON.parse(localStorage.getItem(CHECK_SLEUTEL) || "{}");
      alles[sectieId] = { datum: vandaag(), afgevinkt: afgevinkt };
      localStorage.setItem(CHECK_SLEUTEL, JSON.stringify(alles));
    } catch (e) {}
  }

  /* ------------------------------------------------------------
     ROL (alleen voor wat je in beeld krijgt — geen beveiliging)
     ------------------------------------------------------------ */
  function sessieToken() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        if (k.indexOf("sb-") === 0 && k.indexOf("-auth-token") > -1) {
          var v = JSON.parse(localStorage.getItem(k));
          if (v && v.access_token) return v.access_token;
        }
        if (k === "wz_sessie") {
          var s = JSON.parse(localStorage.getItem(k));
          if (s && s.token) return s.token;
        }
      }
    } catch (e) {}
    return "";
  }

  function haalRol() {
    var t = sessieToken();
    if (!t) return Promise.resolve("onbekend");
    return fetch(SUPABASE_URL + "/rest/v1/rpc/bwf_toegangsrol", {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + t, "Content-Type": "application/json" },
      body: "{}"
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return String(d == null ? "" : d).replace(/"/g, "").toLowerCase() || "onbekend"; })
      .catch(function () { return "onbekend"; });
  }

  /* ------------------------------------------------------------
     TOESTAND
     ------------------------------------------------------------ */
  var DATA = null;       /* wat getoond wordt */
  var BRON = "standaard";
  var ROL = "onbekend";
  var CONCEPT = null;    /* werkversie op de beheerpagina */
  var GEKOZEN = 0;       /* index van de sectie die in beheer openstaat */
  var ZOEK = "";

  function statusLabel(st) {
    var s = DATA.statussen[st] || DATA.statussen.normaal;
    return s ? s.label : st;
  }

  function statusBadge(st) {
    st = DATA.statussen[st] ? st : "normaal";
    return '<span class="hl-status hl-status-' + st + '"><i></i>' + esc(statusLabel(st)) + "</span>";
  }

  /* ------------------------------------------------------------
     TEKENEN — HANDLEIDING
     ------------------------------------------------------------ */
  function tekenKop() {
    $("#hlTitel").textContent = DATA.meta.titel || "";
    $("#hlSubtitel").textContent = DATA.meta.subtitel || "";
    document.title = (DATA.meta.titel || "Handleiding") + " · BWF";

    var leg = $("#hlLegenda");
    leg.innerHTML = "";
    ["normaal", "actie", "spoed"].forEach(function (st) {
      var s = DATA.statussen[st];
      if (!s) return;
      var d = el("div", { class: "hl-legenda-item" });
      d.innerHTML = statusBadge(st) + '<span class="hl-legenda-uitleg">' + esc(s.uitleg) + "</span>";
      leg.appendChild(d);
    });
  }

  function tekenMenu() {
    var nav = $("#hlMenu");
    nav.innerHTML = "";
    DATA.secties.forEach(function (s) {
      var a = el("a", { href: "#", "data-sectie": s.id, class: "hl-menu-item hl-menu-" + (s.status || "normaal") });
      a.innerHTML = '<span class="hl-menu-icoon">' + esc(s.icoon) + "</span><span>" + esc(s.titel) + "</span>";
      nav.appendChild(a);
    });
    if (ROL === "eigenaar") {
      var b = el("a", { href: "#beheer", class: "hl-menu-item hl-menu-beheer" });
      b.innerHTML = '<span class="hl-menu-icoon">⚙️</span><span>Handleiding aanpassen</span>';
      nav.appendChild(b);
    }
  }

  function tekenLijst(s) {
    var ul = '<ul class="hl-lijst">';
    (s.items || []).forEach(function (t) { ul += "<li>" + esc(t) + "</li>"; });
    return ul + "</ul>";
  }

  function tekenKaarten(s) {
    var h = '<div class="hl-kaarten">';
    (s.kaarten || []).forEach(function (k) {
      var st = k.status || "normaal";
      h += '<article class="hl-kaart hl-rand-' + esc(st) + '">';
      h += '<div class="hl-kaart-kop"><span class="hl-kaart-icoon">' + esc(k.icoon) + "</span>";
      h += "<h3>" + esc(k.titel) + "</h3>" + statusBadge(st) + "</div>";
      if (k.tekst) h += "<p>" + esc(k.tekst) + "</p>";
      if (k.lijst && k.lijst.length) {
        h += '<ul class="hl-lijst hl-lijst-compact">';
        k.lijst.forEach(function (t) { h += "<li>" + esc(t) + "</li>"; });
        h += "</ul>";
      }
      h += "</article>";
    });
    return h + "</div>";
  }

  function tekenWorkflow(s) {
    var stappen = s.stappen || [];
    var h = '<ol class="hl-flow">';
    stappen.forEach(function (st, i) {
      h += '<li class="hl-stap"><span class="hl-stap-nr">' + (i + 1) + "</span>";
      h += '<div class="hl-stap-tekst"><strong>' + esc(st.titel) + "</strong>";
      if (st.tekst) h += "<span>" + esc(st.tekst) + "</span>";
      h += "</div></li>";
      if (i < stappen.length - 1) h += '<li class="hl-pijl" aria-hidden="true"><span>→</span></li>';
    });
    return h + "</ol>";
  }

  function tekenTeam(s) {
    var leden = s.leden || [];
    if (!leden.length) {
      return '<div class="hl-leeg">Nog geen teamleden ingevuld.' +
        (ROL === "eigenaar" ? ' Voeg ze toe via <a href="#beheer">Handleiding aanpassen</a>.' : "") + "</div>";
    }
    var h = '<div class="hl-team">';
    leden.forEach(function (m) {
      h += '<article class="hl-teamlid"><div class="hl-teamlid-kop"><span class="hl-avatar">' +
        esc((m.naam || "?").trim().charAt(0).toUpperCase()) + "</span><div><h3>" + esc(m.naam) + "</h3>" +
        (m.functie ? '<span class="hl-gedempt">' + esc(m.functie) + "</span>" : "") + "</div></div><dl>";
      [["Werkdagen", m.werkdagen], ["Werktijden", m.werktijden], ["Locatie", m.locatie], ["Verantwoordelijk voor", m.verantwoordelijkheden]]
        .forEach(function (r) { if (r[1]) h += "<dt>" + r[0] + "</dt><dd>" + esc(r[1]) + "</dd>"; });
      h += "</dl></article>";
    });
    return h + "</div>";
  }

  function contactLink(k) {
    var w = String(k.waarde || "").trim();
    if (!w) return "";
    if (k.type === "email") return "mailto:" + w;
    var cijfers = w.replace(/[^\d+]/g, "");
    if (k.type === "whatsapp") {
      var n = cijfers.replace(/^\+/, "");
      if (n.indexOf("06") === 0) n = "31" + n.slice(1);       /* 06… → 316… */
      else if (n.indexOf("00") === 0) n = n.slice(2);
      return "https://wa.me/" + n;
    }
    return "tel:" + cijfers;
  }

  function tekenContact(s) {
    var iconen = { whatsapp: "💬", telefoon: "📞", email: "✉️" };
    var h = '<div class="hl-contact">';
    (s.kanalen || []).forEach(function (k) {
      var link = contactLink(k);
      var st = k.status || "normaal";
      h += '<article class="hl-kanaal hl-rand-' + esc(st) + '">';
      h += '<div class="hl-kaart-kop"><span class="hl-kaart-icoon">' + (iconen[k.type] || "📌") + "</span><h3>" +
        esc(k.label || k.type) + "</h3>" + statusBadge(st) + "</div>";
      if (k.gebruik) h += "<p>" + esc(k.gebruik) + "</p>";
      if (link) {
        h += '<a class="hl-knop hl-knop-kanaal" href="' + esc(link) + '"' +
          (k.type === "whatsapp" ? ' target="_blank" rel="noopener"' : "") + ">" + esc(k.waarde) + "</a>";
      } else {
        h += '<span class="hl-nog-invullen">Nog niet ingevuld</span>';
      }
      h += "</article>";
    });
    return h + "</div>";
  }

  function tekenChecklist(s) {
    var afgevinkt = laadAfgevinkt(s.id);
    var items = s.items || [];
    var h = '<div class="hl-checklist" data-checklist="' + esc(s.id) + '">';
    h += '<div class="hl-voortgang"><div class="hl-voortgang-tekst"><strong class="hl-procent">0% afgerond</strong>' +
      '<span class="hl-telling"></span></div><div class="hl-balk"><div class="hl-balk-vul"></div></div></div>';
    h += '<p class="hl-gedempt hl-datum">Checklist van ' +
      esc(new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })) + "</p>";
    h += '<ul class="hl-checks">';
    items.forEach(function (t, i) {
      var aan = !!afgevinkt[t];
      h += '<li><label class="hl-check' + (aan ? " klaar" : "") + '"><input type="checkbox" data-item="' + esc(t) + '"' +
        (aan ? " checked" : "") + '><span class="hl-vinkje" aria-hidden="true"></span><span class="hl-check-tekst">' +
        esc(t) + "</span></label></li>";
    });
    h += "</ul>";
    h += '<div class="hl-knoppen"><button type="button" class="hl-knop hl-knop-licht" data-actie="reset">↻ Checklist opnieuw instellen</button>' +
      '<button type="button" class="hl-knop hl-knop-licht" data-actie="print-checklist">🖨️ Print checklist</button></div>';
    return h + "</div>";
  }

  function werkVoortgangBij(box) {
    var vakjes = box.querySelectorAll("input[type=checkbox]");
    var aan = 0;
    vakjes.forEach(function (v) { if (v.checked) aan++; });
    var pct = vakjes.length ? Math.round(aan / vakjes.length * 100) : 0;
    box.querySelector(".hl-procent").textContent = pct + "% afgerond";
    box.querySelector(".hl-telling").textContent = aan + " van " + vakjes.length;
    box.querySelector(".hl-balk-vul").style.width = pct + "%";
    box.classList.toggle("compleet", pct === 100 && vakjes.length > 0);
  }

  function tekenSectie(s) {
    var st = s.status || "normaal";
    var sec = el("section", { class: "hl-sectie hl-type-" + s.type + " hl-sectie-" + st, id: "s-" + s.id, "data-id": s.id });
    var h = '<header class="hl-sectie-kop"><span class="hl-sectie-icoon">' + esc(s.icoon) + "</span>" +
      "<h2>" + esc(s.titel) + "</h2>" + statusBadge(st) + "</header>";
    if (s.intro) h += '<p class="hl-intro">' + esc(s.intro) + "</p>";
    if (s.notitie && s.notitie.tekst) {
      h += '<div class="hl-notitie hl-notitie-' + esc(s.notitie.status || "actie") + '"><strong>Let op</strong> ' +
        esc(s.notitie.tekst) + "</div>";
    }
    if (s.type === "lijst") h += tekenLijst(s);
    else if (s.type === "kaarten") h += tekenKaarten(s);
    else if (s.type === "workflow") h += tekenWorkflow(s);
    else if (s.type === "team") h += tekenTeam(s);
    else if (s.type === "contact") h += tekenContact(s);
    else if (s.type === "checklist") h += tekenChecklist(s);
    if (s.link && s.link.url) {
      h += '<div class="hl-sectie-voet"><a class="hl-knop hl-knop-goud" href="' + esc(s.link.url) + '">' +
        esc(s.link.label || "Openen") + "</a></div>";
    }
    sec.innerHTML = h;
    return sec;
  }

  function tekenHandleiding() {
    tekenKop();
    tekenMenu();
    var inhoud = $("#hlInhoud");
    inhoud.innerHTML = "";
    DATA.secties.forEach(function (s) { inhoud.appendChild(tekenSectie(s)); });
    inhoud.querySelectorAll(".hl-checklist").forEach(werkVoortgangBij);
    pasZoekToe();
  }

  /* ------------------------------------------------------------
     ZOEKEN
     ------------------------------------------------------------ */
  function sectieTekst(s) {
    var delen = [];
    (function loop(v) {
      if (v == null) return;
      if (typeof v === "string") delen.push(v);
      else if (Array.isArray(v)) v.forEach(loop);
      else if (typeof v === "object") for (var k in v) if (k !== "id" && k !== "url") loop(v[k]);
    })(s);
    return delen.join(" ").toLowerCase();
  }

  function markeer(node, woorden) {
    var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
    var teksten = [];
    while (walker.nextNode()) teksten.push(walker.currentNode);
    var re = new RegExp("(" + woorden.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|") + ")", "gi");
    teksten.forEach(function (t) {
      if (!t.nodeValue.trim() || t.parentNode.closest("mark, script, style")) return;
      if (!re.test(t.nodeValue)) return;
      re.lastIndex = 0;
      var span = document.createElement("span");
      span.innerHTML = esc(t.nodeValue).replace(re, "<mark>$1</mark>");
      t.parentNode.replaceChild(span, t);
    });
  }

  function pasZoekToe() {
    var inhoud = $("#hlInhoud");
    var woorden = ZOEK.toLowerCase().split(/\s+/).filter(Boolean);
    var gevonden = 0;
    DATA.secties.forEach(function (s) {
      var sec = inhoud.querySelector('[data-id="' + s.id + '"]');
      var menu = document.querySelector('#hlMenu [data-sectie="' + s.id + '"]');
      var tekst = sectieTekst(s);
      var past = woorden.every(function (w) { return tekst.indexOf(w) > -1; });
      if (sec) sec.hidden = !past;
      if (menu) menu.classList.toggle("verborgen", !past);
      if (past) { gevonden++; if (woorden.length && sec) markeer(sec, woorden); }
    });
    var info = $("#hlZoekInfo");
    if (!woorden.length) { info.textContent = ""; info.hidden = true; }
    else {
      info.hidden = false;
      info.innerHTML = gevonden
        ? gevonden + (gevonden === 1 ? " onderdeel" : " onderdelen") + " gevonden voor <strong>" + esc(ZOEK) + "</strong>"
        : "Niets gevonden voor <strong>" + esc(ZOEK) + "</strong>. Probeer een ander woord.";
    }
    $("#hlGeenResultaat").hidden = !(woorden.length && !gevonden);
  }

  /* ------------------------------------------------------------
     BEHEER
     ------------------------------------------------------------ */
  var BRON_TEKST = {
    lokaal: "Je ziet de versie die op dit apparaat is opgeslagen.",
    gepubliceerd: "Je ziet de gepubliceerde versie (handleiding-data.json).",
    standaard: "Je ziet de standaardtekst. Er is nog niets opgeslagen of gepubliceerd."
  };

  function veldHtml(v, waarde, pad) {
    var id = "f-" + pad.replace(/\W/g, "-");
    var lab = '<label for="' + id + '">' + esc(v.label) + "</label>";
    var naam = ' id="' + id + '" data-pad="' + esc(pad) + '"';
    if (v.soort === "tekstvak") return '<div class="hl-veld">' + lab + '<textarea rows="2"' + naam + ">" + esc(waarde) + "</textarea></div>";
    if (v.soort === "regels") return '<div class="hl-veld">' + lab + '<textarea rows="3" data-regels="1"' + naam + ">" + esc((waarde || []).join("\n")) + "</textarea></div>";
    if (v.soort === "status" || v.soort === "keuze") {
      var opties = v.soort === "status"
        ? ["normaal", "actie", "spoed"].map(function (k) { return [k, (CONCEPT.statussen[k] || {}).label || k]; })
        : v.opties;
      var sel = '<select' + naam + ">";
      opties.forEach(function (o) { sel += '<option value="' + esc(o[0]) + '"' + (o[0] === waarde ? " selected" : "") + ">" + esc(o[1]) + "</option>"; });
      return '<div class="hl-veld' + (v.klein ? " klein" : "") + '">' + lab + sel + "</select></div>";
    }
    return '<div class="hl-veld' + (v.klein ? " klein" : "") + '">' + lab + '<input type="text" value="' + esc(waarde) + '"' + naam + "></div>";
  }

  function tekenBeheer() {
    var b = $("#hlBeheer");
    if (ROL !== "eigenaar") {
      b.innerHTML = '<div class="hl-sectie"><h2>Handleiding aanpassen</h2><p class="hl-intro">Deze pagina is alleen voor de eigenaar. ' +
        'Log in met het eigenaarsaccount en open deze pagina opnieuw.</p><a class="hl-knop hl-knop-goud" href="#">Terug naar de handleiding</a></div>';
      return;
    }
    if (!CONCEPT) CONCEPT = kloon(DATA);
    if (GEKOZEN >= CONCEPT.secties.length) GEKOZEN = 0;

    var h = '<div class="hl-beheer-kop"><div><h2>⚙️ Handleiding aanpassen</h2><p class="hl-gedempt">' + esc(BRON_TEKST[BRON]) + "</p></div>" +
      '<a class="hl-knop hl-knop-licht" href="#">Bekijk handleiding</a></div>';

    /* algemeen */
    h += '<div class="hl-sectie"><h3 class="hl-beheer-titel">Algemeen</h3><div class="hl-rij">' +
      veldHtml({ label: "Paginatitel" }, CONCEPT.meta.titel, "meta.titel") +
      veldHtml({ label: "Subtitel" }, CONCEPT.meta.subtitel, "meta.subtitel") +
      veldHtml({ label: "Knop 'Terug naar dashboard' gaat naar", klein: true }, CONCEPT.meta.terugUrl, "meta.terugUrl") +
      '</div><h3 class="hl-beheer-titel">Statussen</h3><div class="hl-rij hl-rij-3">';
    ["normaal", "actie", "spoed"].forEach(function (k) {
      h += '<div class="hl-status-beheer">' + '<span class="hl-status hl-status-' + k + '"><i></i>' + k + "</span>" +
        veldHtml({ label: "Naam" }, CONCEPT.statussen[k].label, "statussen." + k + ".label") +
        veldHtml({ label: "Uitleg" }, CONCEPT.statussen[k].uitleg, "statussen." + k + ".uitleg") + "</div>";
    });
    h += '</div><p class="hl-gedempt">De kleuren zelf staan bovenaan in handleiding.css (--status-normaal, --status-actie, --status-spoed).</p></div>';

    /* sectiekeuze */
    h += '<div class="hl-sectie"><h3 class="hl-beheer-titel">Onderdelen</h3><div class="hl-sectiekeuze">';
    CONCEPT.secties.forEach(function (s, i) {
      h += '<button type="button" data-kies="' + i + '" class="' + (i === GEKOZEN ? "actief" : "") + '">' + esc(s.icoon) + " " + esc(s.titel) + "</button>";
    });
    h += '<button type="button" data-actie="nieuwe-sectie" class="hl-nieuw">+ Nieuw onderdeel</button></div>';

    var s = CONCEPT.secties[GEKOZEN];
    var T = TYPES[s.type];
    var p = "secties." + GEKOZEN + ".";
    h += '<div class="hl-sectie-edit"><div class="hl-rij">' +
      veldHtml({ label: "Icoon", klein: true }, s.icoon, p + "icoon") +
      veldHtml({ label: "Titel" }, s.titel, p + "titel") +
      veldHtml({ label: "Status", soort: "status", klein: true }, s.status, p + "status") + "</div>" +
      veldHtml({ label: "Inleidende tekst", soort: "tekstvak" }, s.intro, p + "intro");
    if (s.type === "workflow" || s.notitie) {
      h += veldHtml({ label: "Let op-melding (mag leeg)", soort: "tekstvak" }, (s.notitie || {}).tekst, p + "notitie.tekst");
    }
    h += '<div class="hl-rij">' + veldHtml({ label: "Knoptekst onderaan (mag leeg)" }, (s.link || {}).label, p + "link.label") +
      veldHtml({ label: "Knop gaat naar pagina" }, (s.link || {}).url, p + "link.url") + "</div>";

    h += '<h4 class="hl-beheer-sub">' + esc(T.label) + "s <span class=\"hl-gedempt\">(" + esc(T.naam) + ")</span></h4><div class=\"hl-items\">";
    (s[T.veld] || []).forEach(function (item, i) {
      var ip = p + T.veld + "." + i;
      h += '<div class="hl-item"><div class="hl-item-kop"><span class="hl-item-nr">' + (i + 1) + '</span><span class="hl-item-knoppen">' +
        '<button type="button" data-verplaats="' + i + ':-1" title="Omhoog" aria-label="Omhoog">↑</button>' +
        '<button type="button" data-verplaats="' + i + ':1" title="Omlaag" aria-label="Omlaag">↓</button>' +
        '<button type="button" data-verwijder="' + i + '" class="gevaar" title="Verwijderen" aria-label="Verwijderen">✕</button></span></div>';
      if (T.enkel) h += veldHtml({ label: T.label }, item, ip);
      else {
        h += '<div class="hl-item-velden">';
        T.velden.forEach(function (v) { h += veldHtml(v, item[v.k], ip + "." + v.k); });
        h += "</div>";
      }
      h += "</div>";
    });
    h += '</div><button type="button" class="hl-knop hl-knop-licht" data-actie="item-erbij">+ ' + esc(T.label) + " toevoegen</button>";
    h += '<div class="hl-sectie-beheer-knoppen">' +
      '<button type="button" data-actie="sectie-op">↑ Onderdeel hoger</button>' +
      '<button type="button" data-actie="sectie-neer">↓ Onderdeel lager</button>' +
      '<button type="button" data-actie="sectie-weg" class="gevaar">Onderdeel verwijderen</button></div>';
    h += "</div></div>";

    /* opslaan & publiceren */
    h += '<div class="hl-opslaanbalk"><span class="hl-gedempt">Vergeet niet op te slaan.</span><div class="hl-knoppen">' +
      '<button type="button" class="hl-knop hl-knop-licht" data-actie="annuleer">Ongedaan maken</button>' +
      '<button type="button" class="hl-knop hl-knop-goud" data-actie="opslaan">💾 Opslaan</button></div></div>';
    h += '<div class="hl-sectie">' +
      '<h3 class="hl-beheer-titel">Publiceren voor het hele team</h3>' +
      '<p class="hl-intro">Opslaan bewaart je wijzigingen op dit apparaat. Wil je dat medewerkers ze ook zien, download dan ' +
      'het bestand hieronder en zet het als <code>handleiding-data.json</code> in je repository, naast handleiding.html.</p>' +
      '<div class="hl-knoppen"><button type="button" class="hl-knop hl-knop-navy" data-actie="export">⬇️ Download handleiding-data.json</button>' +
      '<label class="hl-knop hl-knop-licht">⬆️ Bestand inlezen<input type="file" accept=".json,application/json" data-actie="import" hidden></label></div>' +
      '<details class="hl-gevaarzone"><summary>Terugzetten</summary><div class="hl-knoppen">' +
      '<button type="button" class="hl-knop hl-knop-licht" data-actie="wis-lokaal">Opgeslagen versie op dit apparaat wissen</button>' +
      '<button type="button" class="hl-knop hl-knop-licht gevaar" data-actie="standaard">Standaardtekst terugzetten</button>' +
      "</div></details></div>";

    b.innerHTML = h;
  }

  /* waarde op een pad als "secties.3.kaarten.0.titel" zetten */
  function zetPad(obj, pad, waarde) {
    var d = pad.split(".");
    var o = obj;
    for (var i = 0; i < d.length - 1; i++) {
      var k = /^\d+$/.test(d[i]) ? +d[i] : d[i];
      if (o[k] == null || typeof o[k] !== "object") o[k] = {};
      o = o[k];
    }
    o[/^\d+$/.test(d[d.length - 1]) ? +d[d.length - 1] : d[d.length - 1]] = waarde;
  }

  function leesVeld(e) {
    var pad = e.getAttribute("data-pad");
    if (!pad || !CONCEPT) return;
    var w = e.value;
    if (e.getAttribute("data-regels")) w = w.split("\n").map(function (r) { return r.trim(); }).filter(Boolean);
    zetPad(CONCEPT, pad, w);
    /* lege knop/notitie opruimen zodat er geen lege blokken verschijnen */
    var s = CONCEPT.secties[GEKOZEN];
    if (s && s.link && !s.link.url && !s.link.label) delete s.link;
    if (s && s.notitie && !s.notitie.tekst) delete s.notitie;
    else if (s && s.notitie && !s.notitie.status) s.notitie.status = "actie";
  }

  function nieuweSectie() {
    var keuze = prompt("Wat voor onderdeel?\n1 = Lijst\n2 = Kaarten\n3 = Workflow (stappen)\n4 = Checklist\n5 = Team\n6 = Contact", "1");
    var type = { 1: "lijst", 2: "kaarten", 3: "workflow", 4: "checklist", 5: "team", 6: "contact" }[String(keuze || "").trim()];
    if (!type) return;
    var T = TYPES[type];
    var s = { id: "onderdeel-" + Date.now().toString(36), icoon: "📌", titel: "Nieuw onderdeel", type: type, status: "normaal", intro: "" };
    s[T.veld] = [];
    CONCEPT.secties.push(s);
    GEKOZEN = CONCEPT.secties.length - 1;
    tekenBeheer();
  }

  function beheerKlik(e) {
    var t = e.target.closest("button, [data-kies]");
    if (!t || !CONCEPT) return;
    var s = CONCEPT.secties[GEKOZEN];
    var T = s && TYPES[s.type];

    if (t.hasAttribute("data-kies")) { GEKOZEN = +t.getAttribute("data-kies"); tekenBeheer(); return; }
    if (t.hasAttribute("data-verplaats")) {
      var d = t.getAttribute("data-verplaats").split(":");
      var i = +d[0], j = i + (+d[1]), lijst = s[T.veld];
      if (j < 0 || j >= lijst.length) return;
      lijst.splice(j, 0, lijst.splice(i, 1)[0]);
      tekenBeheer(); return;
    }
    if (t.hasAttribute("data-verwijder")) {
      if (!confirm("Dit onderdeel verwijderen?")) return;
      s[T.veld].splice(+t.getAttribute("data-verwijder"), 1);
      tekenBeheer(); return;
    }
    var actie = t.getAttribute("data-actie");
    if (actie === "item-erbij") { s[T.veld] = s[T.veld] || []; s[T.veld].push(T.enkel ? "" : kloon(T.leeg)); tekenBeheer(); }
    else if (actie === "nieuwe-sectie") nieuweSectie();
    else if (actie === "sectie-op" || actie === "sectie-neer") {
      var n = GEKOZEN + (actie === "sectie-op" ? -1 : 1);
      if (n < 0 || n >= CONCEPT.secties.length) return;
      CONCEPT.secties.splice(n, 0, CONCEPT.secties.splice(GEKOZEN, 1)[0]);
      GEKOZEN = n; tekenBeheer();
    }
    else if (actie === "sectie-weg") {
      if (!confirm('Het hele onderdeel "' + s.titel + '" verwijderen?\n(Pas definitief na Opslaan.)')) return;
      CONCEPT.secties.splice(GEKOZEN, 1); GEKOZEN = 0; tekenBeheer();
    }
    else if (actie === "opslaan") {
      saveHandleidingData(CONCEPT).then(function () {
        DATA = kloon(CONCEPT); BRON = "lokaal";
        tekenHandleiding(); tekenBeheer();
        melding("Opgeslagen op dit apparaat. Download het bestand om te publiceren voor het team.", "ok");
      }).catch(function () { melding("Opslaan is niet gelukt. Is de opslag van de browser vol of uitgeschakeld?", "fout"); });
    }
    else if (actie === "annuleer") { CONCEPT = kloon(DATA); tekenBeheer(); melding("Niet-opgeslagen wijzigingen zijn teruggezet."); }
    else if (actie === "export") exporteer();
    else if (actie === "wis-lokaal") {
      if (!confirm("De opgeslagen versie op dit apparaat wissen? Je ziet daarna weer de gepubliceerde versie (of de standaardtekst).")) return;
      wisLokaleHandleidingData(); herlaad("Opgeslagen versie gewist.");
    }
    else if (actie === "standaard") {
      if (!confirm("De standaardtekst terugzetten in het bewerkscherm? Pas na Opslaan is het definitief.")) return;
      CONCEPT = kloon(STANDAARD_HANDLEIDING); GEKOZEN = 0; tekenBeheer();
      melding("Standaardtekst staat klaar. Klik op Opslaan om hem te bewaren.");
    }
  }

  function exporteer() {
    var blob = new Blob([JSON.stringify(CONCEPT, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "handleiding-data.json";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function importeer(input) {
    var f = input.files && input.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(r.result);
        if (!geldig(d)) throw new Error("ongeldig");
        CONCEPT = d; GEKOZEN = 0; tekenBeheer();
        melding("Bestand ingelezen. Klik op Opslaan om het te bewaren.", "ok");
      } catch (e) { melding("Dit bestand is geen geldige handleiding.", "fout"); }
    };
    r.readAsText(f);
  }

  /* ------------------------------------------------------------
     WEERGAVE WISSELEN & KOPPELINGEN
     ------------------------------------------------------------ */
  function toonWeergave() {
    var beheer = location.hash === "#beheer";
    $("#hlHandleiding").hidden = beheer;
    $("#hlBeheer").hidden = !beheer;
    document.body.classList.toggle("hl-in-beheer", beheer);
    if (beheer) { CONCEPT = kloon(DATA); tekenBeheer(); }
    window.scrollTo(0, 0);
  }

  function herlaad(tekst) {
    loadHandleidingData().then(function (r) {
      DATA = r.data; BRON = r.bron; CONCEPT = kloon(DATA);
      tekenHandleiding();
      if (location.hash === "#beheer") tekenBeheer();
      if (tekst) melding(tekst);
    });
  }

  function koppel() {
    /* menu: soepel naar een sectie scrollen */
    $("#hlMenu").addEventListener("click", function (e) {
      var a = e.target.closest("[data-sectie]");
      if (!a) return;
      e.preventDefault();
      var sec = document.getElementById("s-" + a.getAttribute("data-sectie"));
      if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    /* zoeken */
    var zoekVeld = $("#hlZoek"), wacht;
    zoekVeld.addEventListener("input", function () {
      clearTimeout(wacht);
      wacht = setTimeout(function () { ZOEK = zoekVeld.value.trim(); tekenHandleiding(); }, 150);
    });
    $("#hlZoekWis").addEventListener("click", function () { zoekVeld.value = ""; ZOEK = ""; tekenHandleiding(); zoekVeld.focus(); });

    /* checklist */
    $("#hlInhoud").addEventListener("change", function (e) {
      var v = e.target;
      if (v.type !== "checkbox") return;
      var box = v.closest(".hl-checklist");
      var id = box.getAttribute("data-checklist");
      var afgevinkt = laadAfgevinkt(id);
      if (v.checked) afgevinkt[v.getAttribute("data-item")] = true;
      else delete afgevinkt[v.getAttribute("data-item")];
      bewaarAfgevinkt(id, afgevinkt);
      v.closest(".hl-check").classList.toggle("klaar", v.checked);
      werkVoortgangBij(box);
    });
    $("#hlInhoud").addEventListener("click", function (e) {
      var k = e.target.closest("[data-actie]");
      if (!k) return;
      var box = k.closest(".hl-checklist");
      if (k.getAttribute("data-actie") === "reset" && box) {
        if (!confirm("Alle vinkjes van vandaag weghalen?")) return;
        bewaarAfgevinkt(box.getAttribute("data-checklist"), {});
        box.querySelectorAll("input[type=checkbox]").forEach(function (v) { v.checked = false; v.closest(".hl-check").classList.remove("klaar"); });
        werkVoortgangBij(box);
      }
      if (k.getAttribute("data-actie") === "print-checklist" && box) printChecklist(box.closest(".hl-sectie"));
    });

    /* print hele handleiding */
    $("#hlPrint").addEventListener("click", function () {
      if (ZOEK) { ZOEK = ""; $("#hlZoek").value = ""; tekenHandleiding(); }
      window.print();
    });

    /* terug naar dashboard */
    $("#hlTerug").addEventListener("click", function (e) {
      e.preventDefault();
      var doel = (DATA && DATA.meta.terugUrl) || "dashboard.html";
      var ref = document.referrer;
      if (ref && ref.indexOf(location.origin) === 0 && ref.indexOf("handleiding") < 0) location.href = ref;
      else location.href = doel;
    });

    /* beheer */
    var b = $("#hlBeheer");
    b.addEventListener("click", beheerKlik);
    b.addEventListener("input", function (e) { if (e.target.hasAttribute("data-pad")) leesVeld(e.target); });
    b.addEventListener("change", function (e) {
      if (e.target.hasAttribute("data-pad")) leesVeld(e.target);
      if (e.target.getAttribute("data-actie") === "import") importeer(e.target);
    });

    window.addEventListener("hashchange", toonWeergave);

    /* naar boven */
    var boven = $("#hlNaarBoven");
    window.addEventListener("scroll", function () { boven.classList.toggle("zichtbaar", window.scrollY > 600); }, { passive: true });
    boven.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
  }

  function printChecklist(sectie) {
    document.body.classList.add("hl-print-checklist");
    sectie.classList.add("hl-print-dit");
    var klaar = function () {
      document.body.classList.remove("hl-print-checklist");
      sectie.classList.remove("hl-print-dit");
      window.removeEventListener("afterprint", klaar);
    };
    window.addEventListener("afterprint", klaar);
    window.print();
    setTimeout(klaar, 1500);
  }

  /* ------------------------------------------------------------
     START
     ------------------------------------------------------------ */
  function start() {
    koppel();
    loadHandleidingData().then(function (r) {
      DATA = r.data; BRON = r.bron;
      /* ontbrekende statussen aanvullen (oudere bestanden) */
      DATA.statussen = DATA.statussen || kloon(STANDAARD_HANDLEIDING.statussen);
      tekenHandleiding();
      toonWeergave();
      $("#hlLaden").hidden = true;
      haalRol().then(function (rol) {
        ROL = rol;
        tekenMenu(); pasZoekToe();
        if (location.hash === "#beheer") toonWeergave();
      });
    });
    window.addEventListener("bwf-ingelogd", function () {
      haalRol().then(function (rol) { ROL = rol; tekenMenu(); pasZoekToe(); });
    });
  }

  /* Voor later: zo kan een andere module (of de console) erbij. */
  window.BWFHandleiding = {
    loadHandleidingData: loadHandleidingData,
    saveHandleidingData: saveHandleidingData,
    standaard: function () { return kloon(STANDAARD_HANDLEIDING); }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
