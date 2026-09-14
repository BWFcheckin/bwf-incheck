/* =========================================================
   bwf-kader.js — het kader van de startpagina op een andere pagina

   Legt de zijbalk, de menubalk en de suitefoto van index.html over
   een bestaande pagina heen. De inhoud van die pagina blijft precies
   zoals hij is; alleen het omhulsel verandert.

   Gebruik: zet deze regel vlak vóór </body>:

     <script src="bwf-kader.js"></script>

   En haal op diezelfde pagina bwf-shell.js weg, anders staan er twee
   menu's overheen.

   Bevalt het niet, haal die ene regel weg en alles is terug.

   NIET gebruiken op vr2.html, dashboard.html en incheckformulier.html:
   die houden hun eigen opzet, op verzoek van Angela.
   ========================================================= */
(function(){
  "use strict";

  /* in een iframe geen tweede kader */
  if (window.self !== window.top) return;
  if (document.getElementById("bwfKaderBalk")) return;

  var HIER = (location.pathname.split("/").pop() || "index.html").toLowerCase();

  var MENU = [
    { groep: "Overzicht", items: [
      { naam: "Start",        icoon: "⌂", bestand: "index.html" },
      { naam: "Vandaag",      icoon: "☀", bestand: "vandaag.html" },
      { naam: "Dagstart",     icoon: "◑", bestand: "dagstart.html" },
      { naam: "Dagoverzicht", icoon: "▤", bestand: "dagoverzicht.html" }
    ]},
    { groep: "Gasten", items: [
      { naam: "Agenda",        icoon: "▦", bestand: "agenda.html" },
      { naam: "Reserveringen", icoon: "▣", bestand: "reserveringen.html" },
      { naam: "Klantbeheer",   icoon: "☺", bestand: "klantbeheer.html" }
    ]},
    { groep: "Werken", items: [
      { naam: "Uren",             icoon: "◷", bestand: "uren-ruth.html" },
      { naam: "VR Dashboard",     icoon: "✦", bestand: "vr2.html" },
      { naam: "Personeel",        icoon: "⌘", bestand: "dashboard.html" },
      { naam: "Incheckformulier", icoon: "✓", bestand: "incheckformulier.html" }
    ]}
  ];

  /* ---------------- opmaak ----------------
     Alles hangt aan eigen id's, zodat de opmaak van de pagina zelf
     er niet mee botst. De kleuren komen uit bwf-agenda-stijl.css. */
  var css = document.createElement("style");
  css.id = "bwf-kader-css";
  css.textContent = [
    ":root{--bwfkader:248px;--bwfkaderbalk:58px}",

    /* ---- zijbalk ---- */
    "#bwfKaderZij{position:fixed;left:0;top:0;bottom:0;width:var(--bwfkader);z-index:9400;",
      "background:linear-gradient(180deg,#123B34,#0E302B);color:#fff;display:none;",
      "flex-direction:column;padding:24px 14px;overflow-y:auto;",
      "font-family:'DM Sans','Public Sans',Arial,sans-serif}",
    "#bwfKaderZij .merk{text-align:center;padding:2px 0 22px}",
    "#bwfKaderZij .merk img{width:88px;height:auto;display:block;margin:0 auto 10px;",
      "filter:brightness(0) invert(1);opacity:.94}",
    "#bwfKaderZij .merk b{display:block;font-family:'Playfair Display',Georgia,serif;",
      "font-size:15px;font-weight:500;letter-spacing:.06em}",
    "#bwfKaderZij .merk span{display:block;margin-top:4px;font-size:8px;",
      "letter-spacing:.28em;text-transform:uppercase;opacity:.6}",
    "#bwfKaderZij .kop{font-size:9px;letter-spacing:.22em;text-transform:uppercase;",
      "color:rgba(255,255,255,.45);margin:16px 0 6px;padding:0 12px}",
    "#bwfKaderZij a{display:flex;align-items:center;gap:12px;text-decoration:none;",
      "color:rgba(255,255,255,.72);font-size:13px;font-weight:500;padding:11px 12px;",
      "border-radius:11px;transition:.2s}",
    "#bwfKaderZij a:hover{background:rgba(255,255,255,.12);color:#fff}",
    "#bwfKaderZij a.hier{background:rgba(255,255,255,.16);color:#fff;font-weight:700}",
    "#bwfKaderZij a i{width:20px;flex:none;text-align:center;font-style:normal;font-size:15px}",
    "#bwfKaderZij .voet{margin-top:auto;text-align:center;padding-top:16px;",
      "border-top:1px solid rgba(255,255,255,.14);color:rgba(255,255,255,.5);",
      "font-family:'Playfair Display',Georgia,serif;font-size:11px;line-height:1.6}",

    /* ---- balk bovenaan ---- */
    "#bwfKaderBalk{position:fixed;top:0;left:0;right:0;height:var(--bwfkaderbalk);z-index:9401;",
      "display:flex;align-items:center;gap:8px;padding:0 14px;",
      "background:rgba(255,255,255,.96);backdrop-filter:blur(18px);",
      "border-bottom:2px solid rgba(23,60,53,.12);",
      "font-family:'DM Sans','Public Sans',Arial,sans-serif;color:#17211E}",
    "#bwfKaderBalk button,#bwfKaderBalk a.knop{display:inline-flex;align-items:center;",
      "justify-content:center;gap:6px;height:38px;min-width:38px;padding:0 13px;",
      "border:2px solid rgba(23,60,53,.12);border-radius:30px;background:#fff;",
      "color:inherit;font:inherit;font-size:12px;font-weight:600;cursor:pointer;",
      "text-decoration:none;white-space:nowrap}",
    "#bwfKaderBalk button:hover,#bwfKaderBalk a.knop:hover{border-color:#C9A96E;color:#173C35}",
    "#bwfKaderBalk .titel{flex:1;min-width:0;text-align:center;font-family:'Playfair Display',Georgia,serif;",
      "font-size:17px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    "#bwfKaderBalk .thuis{background:#173C35;border-color:#173C35;color:#fff}",
    "#bwfKaderBalk .thuis:hover{background:#28584E;color:#fff}",

    /* ---- suitefoto onder de balk ---- */
    "#bwfKaderBeeld{height:104px;background-size:cover;background-position:center;",
      "background-image:var(--foto-hero,none);position:relative}",
    "#bwfKaderBeeld:after{content:'';position:absolute;inset:0;",
      "background:linear-gradient(90deg,rgba(9,44,37,.82),rgba(9,44,37,.18))}",
    "#bwfKaderBeeld b{position:relative;z-index:1;display:block;padding:34px 22px 0;",
      "color:#fff;font-family:'Playfair Display',Georgia,serif;font-size:22px;font-weight:500}",

    /* ---- ruimte maken voor het kader ---- */
    "body{padding-top:var(--bwfkaderbalk)!important}",
    "html{scroll-padding-top:calc(var(--bwfkaderbalk) + 8px)}",
    "body.gate-open,body.bwf-vergrendeld{padding-top:0!important;padding-left:0!important}",
    "body.gate-open #bwfKaderBalk,body.gate-open #bwfKaderZij,body.gate-open #bwfKaderBeeld,",
    "body.bwf-vergrendeld #bwfKaderBalk,body.bwf-vergrendeld #bwfKaderZij,",
    "body.bwf-vergrendeld #bwfKaderBeeld{display:none!important}",

    /* de oude balk uitzetten als die er toch nog is */
    "#bwfBalk,#bwfPaneel,#bwfLaag,#bwfMenuKnop{display:none!important}",

    /* Balken die een pagina zelf bovenaan vastplakt, moeten onder de
       kaderbalk door. Alleen paginabalken: .topbar op klantbeheer en
       vandaag, .menubalk op dagstart, plus de drie namen die de oude
       shell gebruikte. NIET th, .v-kop, .detail-kop of .modal-head:
       die plakken binnen een tabel of een venster en horen te blijven
       waar ze zijn. */
    ".topbar,.menubalk,.tabs,.topbalk,.paginakop{top:var(--bwfkaderbalk)!important}",

    /* ---- laag voor het uitschuifmenu op smalle schermen ---- */
    "#bwfKaderLaag{position:fixed;inset:0;z-index:9390;background:rgba(9,44,37,.45);display:none}",
    "#bwfKaderLaag.open{display:block}",
    "#bwfKaderZij.open{display:flex}",

    /* ---- breed scherm: zijbalk staat vast ---- */
    "@media(min-width:1100px){",
      "#bwfKaderZij{display:flex;top:0}",
      "body{padding-left:var(--bwfkader)!important}",
      "#bwfKaderBalk{left:var(--bwfkader)}",
      "#bwfKaderMenu{display:none}",
      "#bwfKaderLaag{display:none!important}",
    "}",
    "@media(max-width:1099px){",
      "#bwfKaderZij{width:min(280px,86vw);box-shadow:14px 0 44px -24px rgba(9,44,37,.7)}",
      "#bwfKaderBeeld{height:84px}",
      "#bwfKaderBeeld b{padding-top:26px;font-size:18px}",
    "}",
    "@media print{#bwfKaderBalk,#bwfKaderZij,#bwfKaderBeeld,#bwfKaderLaag{display:none!important}",
      "body{padding-top:0!important;padding-left:0!important}}"
  ].join("");
  (document.head || document.documentElement).appendChild(css);

  /* ---------------- bouwen ---------------- */
  function paginaNaam(){
    for (var g = 0; g < MENU.length; g++)
      for (var i = 0; i < MENU[g].items.length; i++)
        if (MENU[g].items[i].bestand.toLowerCase() === HIER) return MENU[g].items[i].naam;
    return (document.title || "").split("—")[0].trim() || "Bed & Wellness";
  }

  var zij = document.createElement("nav");
  zij.id = "bwfKaderZij";
  zij.setAttribute("aria-label", "Hoofdmenu");

  var h = '<div class="merk">' +
    '<img src="https://bedenwellnessflevoland.nl/Logo/1_Logo.webp" alt="Bed &amp; Wellness Flevoland">' +
    '<b>BED &amp; WELLNESS</b><span>Flevoland</span></div>';
  for (var g = 0; g < MENU.length; g++) {
    h += '<div class="kop">' + MENU[g].groep + "</div>";
    for (var i = 0; i < MENU[g].items.length; i++) {
      var p = MENU[g].items[i];
      var nu = p.bestand.toLowerCase() === HIER;
      h += '<a href="' + p.bestand + '"' + (nu ? ' class="hier" aria-current="page"' : "") + ">" +
        '<i>' + p.icoon + "</i>" + p.naam + "</a>";
    }
  }
  h += '<div class="voet">Samen zorgen we<br>voor een onvergetelijk<br>verblijf.</div>';
  zij.innerHTML = h;

  var laag = document.createElement("div");
  laag.id = "bwfKaderLaag";

  var balk = document.createElement("header");
  balk.id = "bwfKaderBalk";
  balk.innerHTML =
    '<button type="button" id="bwfKaderMenu" aria-label="Menu">☰</button>' +
    '<button type="button" id="bwfKaderTerug" aria-label="Terug">‹</button>' +
    '<span class="titel">' + paginaNaam() + "</span>" +
    '<a class="knop thuis" href="index.html">Start</a>';

  var beeld = document.createElement("div");
  beeld.id = "bwfKaderBeeld";
  beeld.innerHTML = "<b>" + paginaNaam() + "</b>";

  function plaats(){
    document.body.appendChild(laag);
    document.body.appendChild(zij);
    document.body.appendChild(balk);
    document.body.insertBefore(beeld, document.body.firstChild);

    document.getElementById("bwfKaderMenu").addEventListener("click", function(){
      zij.classList.toggle("open");
      laag.classList.toggle("open");
    });
    document.getElementById("bwfKaderTerug").addEventListener("click", function(){
      var dlg = document.querySelector("dialog[open]");
      if (dlg) { dlg.close(); return; }
      if (history.length > 1) history.back(); else location.href = "index.html";
    });
    laag.addEventListener("click", function(){
      zij.classList.remove("open"); laag.classList.remove("open");
    });
    document.addEventListener("keydown", function(e){
      if (e.key === "Escape") { zij.classList.remove("open"); laag.classList.remove("open"); }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", plaats);
  else plaats();
})();
