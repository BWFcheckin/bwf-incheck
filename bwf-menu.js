/* ============================================================
   BWF — één menubalk voor alle schermen
   ------------------------------------------------------------
   Angela, 21-09-2026: er stonden twee menu's boven elkaar. De donkergroene
   balk met het uitschuifmenu (bwf-kader.js) ging eruit; deze bruine balk met
   de paginanamen bleef over.

   Daarna bleek er nóg een rij onder te staan: de tabbladen van het scherm zelf
   (Overzicht, Planning, Voorraad, Overdracht, Vragen & taken). Twee rijen
   knoppen onder elkaar in verschillende stijlen leest als twee menu's. Die
   tabbladen worden nu de bovenste helft van déze balk, met een streepje ertussen:

       [logo]  Overzicht  Planning  Voorraad  Overdracht  Vragen & taken
               · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·
               Vandaag  Reserveringen  Incheck  Agenda  VR

   Boven: waar je binnen dit scherm heen gaat. Onder: naar een andere pagina.

   WAT IEMAND MAG ZIEN hangt af van de toegangsrol (eigenaar / vr /
   locatiemanager). Die wordt bij de database opgevraagd met bwf_toegangsrol(),
   dezelfde functie waar de RLS-regels op draaien - zo kunnen scherm en
   database elkaar niet tegenspreken. Dit is een gemak, geen beveiliging: de
   echte afscherming zit in de RLS-regels.

   Opnemen is genoeg:  <script src="bwf-menu.js?v=4"></script>
   De balk plakt bewust niet vast; hij stond eerder met position:sticky boven
   in beeld, en dan landde een tik op een veld eronder op de eerste link.
   ============================================================ */
(function () {
  "use strict";

  /* In een iframe hoort geen tweede menubalk: reserveringen.html draait
     ingebed in het VR-dashboard. */
  if (window.self !== window.top) {
    var bestaand = document.getElementById("bwfTop");
    if (bestaand) bestaand.remove();
    return;
  }

  var HIER = (location.pathname.split("/").pop() || "index.html").toLowerCase();

  /* Pagina's met een eigen, volwaardige balk krijgen deze er niet bij. vr2
     heeft er al een met Wachtwoord en Uitloggen erin. */
  var EIGEN_BALK = ["vr2.html"];
  if (EIGEN_BALK.indexOf(HIER) > -1) {
    var dubbel = document.getElementById("bwfTop");
    if (dubbel) dubbel.remove();
    return;
  }

  var PAGINAS = [
    ["Dagstart", "dagstart.html"],
    ["Vandaag", "vandaag.html"],
    ["Agenda", "agenda.html"],
    ["Reserveringen", "reserveringen.html"],
    ["Incheck", "incheckformulier.html"],
    ["Klanten", "klantbeheer.html"],
    ["VR", "vr2.html"],
    ["Locatie", "dashboard.html"],
    ["Hulp", "controle.html"]
  ];

  /* Wat elke rol in de balk ziet. Angela, 21-09-2026:
     - de eigenaar ziet alles;
     - een locatiemanager (Ruth, Jerry, Michel) werkt op de locatie: hij moet
       zien wie er vandaag komt, welke reserveringen en incheckformulieren
       eraan komen, en verder alles wat op zijn eigen dashboard staat
       (planning, voorraad, overdracht, vragen en taken - dat zijn tabbladen,
       die staan los van deze lijst). Geen doorverwijzing naar het
       VR-dashboard of naar de klantgegevens van de andere locatie.
     - een vr-assistent werkt in vr2 en heeft het locatiedashboard niet nodig.
     Een rol die hier niet in staat krijgt alleen wat iedereen mag zien. */
  var PER_ROL = {
    eigenaar:       null,   /* null = alles */
    vr:             ["dagstart.html", "vandaag.html", "agenda.html", "reserveringen.html",
                     "incheckformulier.html", "klantbeheer.html", "vr2.html", "controle.html"],
    locatiemanager: ["vandaag.html", "reserveringen.html", "incheckformulier.html",
                     "dashboard.html"],
    onbekend:       ["vandaag.html", "reserveringen.html", "incheckformulier.html",
                     "dashboard.html"]
  };

  /* De pagina waar je al bent hoeft er niet nog eens in als doorverwijzing.
     Angela wilde vooral dat een locatiemanager geen knop "Personeel" naar zijn
     eigen scherm ziet staan. */
  var ROL = null;   /* wordt gevuld zodra de database antwoordt */

  var css = document.createElement("style");
  css.textContent = [
    ".bwf-topmenu{position:static;z-index:8500;background:var(--bwfmenu-kleur,#483C34);",
      "box-shadow:0 2px 10px -6px rgba(36,30,25,.7)}",
    ".bwf-topmenu .binnen{max-width:1320px;margin:0 auto;display:flex;gap:6px;flex-wrap:wrap;",
      "align-items:center;padding:8px 16px}",
    ".bwf-topmenu img{height:26px;width:auto;flex:none;margin-right:4px}",
    ".bwf-topmenu a,.bwf-topmenu .bwfk-tab{color:rgba(255,255,255,.84);text-decoration:none;font-size:13px;",
      "padding:5px 11px;border-radius:999px;border:1px solid transparent;white-space:nowrap;",
      "background:none;font-family:inherit;cursor:pointer}",
    ".bwf-topmenu a:hover,.bwf-topmenu .bwfk-tab:hover{background:rgba(255,255,255,.14);color:#fff}",
    ".bwf-topmenu a.hier,.bwf-topmenu .bwfk-tab[aria-selected=\"true\"]{background:#fff;",
      "color:var(--bwfmenu-kleur,#483C34);border-color:#fff;font-weight:600}",
    /* De tabbladen van het scherm zelf staan bovenin, de paginalinks eronder,
       gescheiden door een dun streepje over de hele breedte. */
    ".bwf-topmenu .rij{display:flex;gap:6px;flex-wrap:wrap;align-items:center;width:100%}",
    /* De verhuisde tabbalk brengt zijn eigen opmaak van het scherm mee; die
       hoort hier niet meer te gelden. Vandaar dat deze regels hem terugzetten. */
    ".bwf-topmenu [data-bwf-verhuisd]{background:none!important;border:0!important;",
      "box-shadow:none!important;padding:0!important;margin:0!important;overflow:visible!important}",
    ".bwf-topmenu [data-bwf-verhuisd] .bwfk-tab{border-bottom:0!important;box-shadow:none!important}",
    ".bwf-topmenu .rij.paginas{border-top:1px solid rgba(255,255,255,.16);margin-top:7px;padding-top:7px}",
    ".bwf-topmenu .rij.paginas a{font-size:12.5px;opacity:.92}",
    ".bwf-topmenu .bwfk-tab .badge,.bwf-topmenu .bwfk-tab .telling{background:rgba(255,255,255,.22);",
      "border-radius:999px;padding:0 6px;margin-left:5px;font-size:11px}",
    ".bwf-topmenu .bwfk-tab[aria-selected=\"true\"] .badge{background:rgba(0,0,0,.12)}",
    ".bwf-topmenu .wie{margin-left:auto;color:rgba(255,255,255,.72);font-size:11.5px;",
      "font-family:'IBM Plex Mono',monospace}",
    /* In- en uitloggen hoort in de balk te staan. Angela, 22-09-2026: het zat
       per scherm ergens anders - dagstart en vandaag hadden een eigen knop,
       de andere schermen helemaal geen. */
    ".bwf-topmenu .bwfsessie{font:inherit;font-size:12.5px;padding:4px 11px;border-radius:999px;",
      "border:1px solid rgba(255,255,255,.34);background:none;color:rgba(255,255,255,.9);",
      "cursor:pointer;white-space:nowrap;margin-left:8px}",
    ".bwf-topmenu .bwfsessie:hover{background:rgba(255,255,255,.16);color:#fff}",
    ".bwf-topmenu .bwfsessie.aan{border-color:rgba(255,255,255,.2)}",
    /* Op een telefoon nam de balk een derde van het scherm in: logo, twee
       rijen knoppen en ruime marges. Angela, 22-09-2026. Hier gaat alles een
       maat kleiner en schuift elke rij zijwaarts in plaats van door te lopen
       op een tweede regel. Het logo verdwijnt: je weet wel van wie het
       dashboard is, en het koste een hele regel. */
    "@media(max-width:760px){",
      ".bwf-topmenu .binnen{padding:5px 10px;gap:3px}",
      ".bwf-topmenu img{display:none}",
      ".bwf-topmenu .rij{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;",
        "-webkit-overflow-scrolling:touch}",
      ".bwf-topmenu .rij::-webkit-scrollbar{display:none}",
      ".bwf-topmenu a,.bwf-topmenu .bwfk-tab{padding:4px 9px;font-size:12.5px}",
      ".bwf-topmenu .rij.paginas{margin-top:4px;padding-top:4px}",
      ".bwf-topmenu .rij.paginas a{font-size:12px}",
      ".bwf-topmenu .wie{display:none}",
      ".bwf-topmenu .bwfsessie{padding:3px 9px;font-size:12px;margin-left:4px}",
    "}",
    "@media print{.bwf-topmenu{display:none}}"
  ].join("");
  (document.head || document.documentElement).appendChild(css);

  /* ---------- welke rol heeft degene die hier kijkt ---------- */

  function token() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        /* het portaal en de losse schermen bewaren de sessie elk net anders */
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

  /* bwf_toegangsrol() geeft 'eigenaar', 'vr', 'locatiemanager' of niets terug.
     Lukt het niet - niet ingelogd, geen verbinding - dan blijft het bij het
     beperkte menu. Liever een knop te weinig dan een knop die niet had gemogen. */
  /* Alleen dashboard.html zet window.SUPABASE_URL en -KEY; de overige schermen
     houden hun verbindingsgegevens in hun eigen variabelen. Zonder terugval
     kreeg iedereen daar het beperkte menu, ook de eigenaar. Nagemeten op
     21-09-2026: agenda, vandaag, dagstart, controle en klantbeheer hadden er
     vier links in plaats van acht.

     Dit is de publieke sleutel ("publishable"), dezelfde die al in elk scherm
     in de broncode staat en die bedoeld is om in de browser te staan. Hij
     opent op zichzelf niets: alle tabellen zitten achter RLS en deze functie
     werkt alleen mét een persoonlijk sessietoken. */
  var STANDAARD_URL = "https://iuyjvtlauktnjprbmbjj.supabase.co";
  var STANDAARD_KEY = "sb_publishable_SfQjQTwKa3BgCtjwE-8ljw_mTpqEY3U";

  function haalRol(klaar) {
    var t = token();
    var url = window.SUPABASE_URL || STANDAARD_URL;
    var key = window.SUPABASE_KEY || STANDAARD_KEY;
    if (!t) { klaar("onbekend"); return; }
    fetch(String(url).replace(/\/$/, "") + "/rest/v1/rpc/bwf_toegangsrol", {
      method: "POST",
      headers: { apikey: key, Authorization: "Bearer " + t, "Content-Type": "application/json" },
      body: "{}"
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var rol = String(d == null ? "" : d).replace(/"/g, "").toLowerCase();
        klaar(PER_ROL[rol] !== undefined ? rol : "onbekend");
      })
      .catch(function () { klaar("onbekend"); });
  }

  function magZien(bestand) {
    var lijst = PER_ROL[ROL || "onbekend"];
    if (lijst === null) return true;                  /* eigenaar: alles */
    return lijst.indexOf(bestand.toLowerCase()) > -1;
  }

  /* ---------- de balk ---------- */

  /* De tabbladen van het scherm zelf verhuizen naar binnen de balk.

     Het hele element verhuist, niet de losse knoppen eruit. Dat is het punt:
     dashboard.html luistert op de container (`document.getElementById("tabs")
     .addEventListener("click", ...)`), en andere code zoekt de knoppen op via
     `nav.tabs button[data-tab]`. Haalde je de knoppen eruit en gooide je de
     container weg, dan staan de tabbladen er nog maar doet klikken niets meer.
     Zo gemeten op 21-09-2026, voordat het live ging.

     appendChild verplaatst het bestaande element; id, klassen en alle
     aangehechte luisteraars blijven daarbij gewoon bestaan. */
  function tabbladen() {
    var bron = document.querySelector('nav.tabs[role="tablist"], nav#tabs, .tabs[role="tablist"]');
    if (!bron || bron.closest(".bwf-topmenu")) return null;
    var knoppen = bron.querySelectorAll('[role="tab"], button');
    if (!knoppen.length) return null;
    for (var i = 0; i < knoppen.length; i++) knoppen[i].classList.add("bwfk-tab");
    bron.classList.add("rij");
    bron.setAttribute("data-bwf-verhuisd", "1");
    return bron;
  }

  function vulBalk() {
    var vak = document.getElementById("bwfTop");
    if (!vak) {
      vak = document.createElement("div");
      vak.id = "bwfTop";
      document.body.insertBefore(vak, document.body.firstChild);
    }
    if (vak.className.indexOf("bwf-topmenu") < 0) vak.className += " bwf-topmenu";

    var binnen = document.createElement("div");
    binnen.className = "binnen";

    var logo = document.createElement("img");
    logo.src = "https://bedenwellnessflevoland.nl/Logo/1_Logo.webp";
    logo.alt = "BWF";
    binnen.appendChild(logo);

    var tabs = tabbladen();
    if (tabs) binnen.appendChild(tabs);

    var rij = document.createElement("div");
    rij.className = "rij paginas";
    for (var i = 0; i < PAGINAS.length; i++) {
      var bestand = PAGINAS[i][1].toLowerCase();
      if (bestand === HIER) continue;          /* niet naar jezelf verwijzen */
      if (!magZien(bestand)) continue;
      var a = document.createElement("a");
      a.href = PAGINAS[i][1];
      a.textContent = PAGINAS[i][0];
      rij.appendChild(a);
    }
    var wie = document.createElement("span");
    wie.className = "wie";
    wie.id = "bwfTopWie";
    rij.appendChild(wie);
    binnen.appendChild(rij);

    vak.innerHTML = "";
    vak.appendChild(binnen);
    zetSessieKnop();
  }

  /* Alleen de paginalinks opnieuw zetten zodra de rol bekend is. De tabbladen
     blijven staan waar ze staan: die zijn verhuisd, niet nagemaakt, en opnieuw
     tekenen zou de klikafhandeling van het scherm kwijtmaken. */
  function paginasOpnieuw() {
    var vak = document.getElementById("bwfTop");
    var rij = vak && vak.querySelector(".rij.paginas");
    if (!rij) return;
    var wie = document.getElementById("bwfTopWie");
    rij.innerHTML = "";
    for (var i = 0; i < PAGINAS.length; i++) {
      var bestand = PAGINAS[i][1].toLowerCase();
      if (bestand === HIER || !magZien(bestand)) continue;
      var a = document.createElement("a");
      a.href = PAGINAS[i][1];
      a.textContent = PAGINAS[i][0];
      rij.appendChild(a);
    }
    if (wie) rij.appendChild(wie);
    zetSessieKnop();
  }

  /* Naam en rol van wie er is ingelogd, als de pagina dat weet. */
  function wie() {
    var el = document.getElementById("bwfTopWie");
    if (el && window.BWF && (window.BWF.medewerker || window.BWF.email)) {
      el.textContent = (window.BWF.medewerker || window.BWF.email) + (ROL ? " · " + ROL : "");
    }
    zetSessieKnop();
  }

  /* De knop rechts in de balk: uitloggen als je bent ingelogd, anders inloggen.
     Uitloggen is overal hetzelfde - de sessie staat in localStorage - maar
     inloggen gebeurt per scherm op een eigen manier. Daarom stuurt die knop je
     naar de startpagina, waar het inlogscherm staat; dat werkt op elk scherm
     en gokt nergens naar een knop die er misschien niet is.
     Angela, 22-09-2026. */
  function sessieSleutels() {
    var uit = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        if ((k.indexOf("sb-") === 0 && k.indexOf("-auth-token") > -1) || k === "wz_sessie") uit.push(k);
      }
    } catch (e) {}
    return uit;
  }

  function uitloggen() {
    if (!confirm("Uitloggen?")) return;
    sessieSleutels().forEach(function (k) {
      try { localStorage.removeItem(k); } catch (e) {}
    });
    /* Ook de naam die sommige schermen los bewaren, zodat er niets van de
       vorige persoon blijft staan. */
    try { localStorage.removeItem("bw-wie"); } catch (e) {}
    location.reload();
  }

  function zetSessieKnop() {
    var rij = document.querySelector(".bwf-topmenu .rij.paginas");
    if (!rij) return;
    var knop = document.getElementById("bwfSessieKnop");
    var ingelogd = !!token();
    if (!knop) {
      knop = document.createElement("button");
      knop.id = "bwfSessieKnop";
      knop.type = "button";
      knop.className = "bwfsessie";
      knop.addEventListener("click", function () {
        if (token()) uitloggen();
        else location.href = "index.html";
      });
      rij.appendChild(knop);
    } else if (knop.parentNode !== rij) {
      rij.appendChild(knop);        /* na opnieuw tekenen weer achteraan zetten */
    }
    knop.textContent = ingelogd ? "Uitloggen" : "Inloggen";
    knop.className = "bwfsessie" + (ingelogd ? " aan" : "");
    knop.title = ingelogd ? "Afmelden op dit apparaat" : "Naar het inlogscherm";
  }

  function start() {
    vulBalk();
    haalRol(function (rol) { ROL = rol; paginasOpnieuw(); wie(); });
    window.addEventListener("bwf-ingelogd", function () {
      haalRol(function (rol) { ROL = rol; paginasOpnieuw(); wie(); });
    });
    setTimeout(wie, 800);
    setInterval(wie, 4000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
