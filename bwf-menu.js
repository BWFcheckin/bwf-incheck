/* ============================================================
   BWF — één menubalk voor alle schermen
   ------------------------------------------------------------
   Angela, 21-09-2026: er stonden twee menu's op elke pagina. De donkergroene
   balk met het uitschuifmenu (bwf-kader.js) gaat eruit; deze bruine balk met
   de paginanamen blijft over. Die stond eerder alleen in dashboard.html en is
   hierheen verhuisd, zodat elk scherm dezelfde navigatie heeft.

   Het bestand maakt zijn eigen element aan als de pagina er nog geen heeft,
   dus opnemen is genoeg:  <script src="bwf-menu.js?v=1"></script>

   De balk plakt bewust niet vast. Hij stond eerder met position:sticky boven
   in beeld; zodra de browser een invoerveld in beeld scrolde, kwam dat veld
   onder de balk te liggen en landde een tik op de eerste link - Dagstart -
   in plaats van op het veld.
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

  var PAGINAS = [
    ["Dagstart", "dagstart.html"],
    ["Vandaag", "vandaag.html"],
    ["Agenda", "agenda.html"],
    ["Reserveringen", "reserveringen.html"],
    ["Incheck", "incheckformulier.html"],
    ["Klanten", "klantbeheer.html"],
    ["VR", "vr2.html"],
    ["Personeel", "dashboard.html"],
    ["Hulp", "controle.html"]
  ];

  /* Wat op een bepaalde pagina niet in de balk hoort. Angela, 21-09-2026:
     het personeelsdashboard hoeft niet in het VR-dashboard te staan. */
  var VERBERG = {
    "vr2.html": ["dashboard.html"]
  };

  var css = document.createElement("style");
  css.textContent = [
    ".bwf-topmenu{position:static;z-index:8500;background:var(--bwfmenu-kleur,#483C34);",
      "box-shadow:0 2px 10px -6px rgba(36,30,25,.7)}",
    ".bwf-topmenu .binnen{max-width:1320px;margin:0 auto;display:flex;gap:6px;flex-wrap:wrap;",
      "align-items:center;padding:8px 16px}",
    ".bwf-topmenu img{height:26px;width:auto;flex:none;margin-right:4px}",
    ".bwf-topmenu a{color:rgba(255,255,255,.84);text-decoration:none;font-size:13px;padding:5px 11px;",
      "border-radius:999px;border:1px solid transparent;white-space:nowrap}",
    ".bwf-topmenu a:hover{background:rgba(255,255,255,.14);color:#fff}",
    ".bwf-topmenu a.hier{background:#fff;color:var(--bwfmenu-kleur,#483C34);border-color:#fff;font-weight:600}",
    ".bwf-topmenu .wie{margin-left:auto;color:rgba(255,255,255,.72);font-size:11.5px;",
      "font-family:'IBM Plex Mono',monospace}",
    "@media(max-width:760px){.bwf-topmenu .binnen{flex-wrap:nowrap;overflow-x:auto}}",
    "@media print{.bwf-topmenu{display:none}}"
  ].join("");
  (document.head || document.documentElement).appendChild(css);

  function vulBalk() {
    var vak = document.getElementById("bwfTop");
    if (!vak) {
      vak = document.createElement("div");
      vak.className = "bwf-topmenu";
      vak.id = "bwfTop";
      document.body.insertBefore(vak, document.body.firstChild);
    } else if (vak.className.indexOf("bwf-topmenu") < 0) {
      vak.className += " bwf-topmenu";
    }

    var hier = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    var verberg = VERBERG[hier] || [];
    var uit = ['<div class="binnen">',
      '<img src="https://bedenwellnessflevoland.nl/Logo/1_Logo.webp" alt="BWF">'];
    for (var i = 0; i < PAGINAS.length; i++) {
      if (verberg.indexOf(PAGINAS[i][1].toLowerCase()) > -1) continue;
      var aan = PAGINAS[i][1].toLowerCase() === hier;
      uit.push('<a href="' + PAGINAS[i][1] + '"' + (aan ? ' class="hier"' : "") +
        ">" + PAGINAS[i][0] + "</a>");
    }
    uit.push('<span class="wie" id="bwfTopWie"></span></div>');
    vak.innerHTML = uit.join("");
  }

  /* Naam en rol van wie er is ingelogd, als de pagina dat weet. */
  function wie() {
    var el = document.getElementById("bwfTopWie");
    if (el && window.BWF && (window.BWF.medewerker || window.BWF.email)) {
      el.textContent = (window.BWF.medewerker || window.BWF.email) +
        (window.BWF.rol ? " · " + window.BWF.rol : "");
    }
  }

  function start() {
    vulBalk();
    window.addEventListener("bwf-ingelogd", wie);
    setTimeout(wie, 800);
    setInterval(wie, 4000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
