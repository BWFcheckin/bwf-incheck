/* =========================================================
   BWF Shell — gedeelde bovenbalk + responsive laag
   Voeg op elke pagina vlak voor </body> deze regel toe:
       <script src="bwf-shell.js"></script>
   ========================================================= */
(function(){
  "use strict";

  /* in een iframe (bijv. Klantbeheer in een tabblad) geen tweede balk */
  if (window.self !== window.top) return;

  var HOME = "dashboard.html?tab=overzicht";

  var PAGINAS = [
    { groep: "Dagelijks", items: [
      { naam: "Overzicht Lelystad", bestand: "dashboard.html" },
      { naam: "Dagoverzicht",       bestand: "dagoverzicht.html" },
      { naam: "Reserveringen",      bestand: "reserveringen.html" },
      { naam: "Incheckformulier",   bestand: "incheckformulier.html" },
      { naam: "Gastenlink",         bestand: "gast.html" }
    ]},
    { groep: "Werken", items: [
      { naam: "VR Dashboard", bestand: "vr2.html" },
      { naam: "Klantbeheer",  bestand: "klantbeheer.html" },
      { naam: "Startpagina",  bestand: "index.html" }
    ]}
  ];

  var hier = (location.pathname.split("/").pop() || "index.html").toLowerCase();

  /* ---------------- opmaak ---------------- */
  var css = document.createElement("style");
  css.id = "bwf-shell-css";
  css.textContent = [
    ":root{--bwfbalk:52px}",

    /* ---- de balk ---- */
    "#bwfBalk{position:fixed;top:0;left:0;right:0;height:var(--bwfbalk);z-index:9500;",
      "display:flex;align-items:center;gap:6px;padding:0 max(10px,env(safe-area-inset-left)) 0 max(10px,env(safe-area-inset-right));",
      "background:var(--surface,#fff);border-bottom:1px solid var(--line,#dfe6ef);",
      "box-shadow:0 2px 12px rgba(20,32,51,.06);",
      "font-family:'Public Sans','Helvetica Neue',Arial,sans-serif;color:var(--ink,#142033)}",
    "#bwfBalk button,#bwfBalk a.bwfknop{display:inline-flex;align-items:center;justify-content:center;gap:7px;",
      "height:38px;min-width:38px;padding:0 13px;border:1px solid var(--line,#dfe6ef);border-radius:11px;",
      "background:var(--surface-2,#f7f9fc);color:inherit;font:inherit;font-size:14px;font-weight:600;",
      "cursor:pointer;text-decoration:none;white-space:nowrap}",
    "#bwfBalk button:hover,#bwfBalk a.bwfknop:hover{border-color:var(--accent,#165dff);color:var(--accent,#165dff)}",
    "#bwfBalk .bwfhome{background:var(--accent,#165dff);border-color:var(--accent,#165dff);color:#fff}",
    "#bwfBalk .bwfhome:hover{color:#fff;filter:brightness(1.08)}",
    "#bwfBalk .bwftitel{flex:1;min-width:0;text-align:center;font-weight:700;font-size:15px;",
      "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 6px}",
    "#bwfBalk svg{width:17px;height:17px;flex:none}",
    "@media(max-width:560px){#bwfBalk .bwflabel{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}",
      "#bwfBalk button,#bwfBalk a.bwfknop{padding:0 11px}",
      "#bwfBalk .bwftitel{font-size:13.5px}}",

    /* ---- ruimte onder de balk + bestaande plakrandjes opschuiven ---- */
    "body{padding-top:var(--bwfbalk)!important}",
    "html{scroll-padding-top:calc(var(--bwfbalk) + 8px)}",
    ".tabs,.topbalk,.paginakop{top:var(--bwfbalk)!important}",
    "@media(max-width:620px){.tabs{top:auto!important}}",
    "#bwfMenuKnop{display:none!important}",
    /* tijdens een inlog- of toegangsscherm de balk niet tonen */
    "body.gate-open #bwfBalk,body.gate-open #bwfPaneel,body.gate-open #bwfLaag,",
    "body.bwf-vergrendeld #bwfBalk,body.bwf-vergrendeld #bwfPaneel,body.bwf-vergrendeld #bwfLaag{display:none!important}",
    "body.gate-open,body.bwf-vergrendeld{padding-top:0!important}",

    /* ---- menupaneel ---- */
    "#bwfLaag{position:fixed;inset:0;z-index:9490;background:rgba(20,32,51,.42);display:none}",
    "#bwfLaag.open{display:block}",
    "#bwfPaneel{position:fixed;top:var(--bwfbalk);left:0;z-index:9501;width:min(300px,88vw);",
      "max-height:calc(100dvh - var(--bwfbalk));overflow-y:auto;display:none;",
      "background:var(--surface,#fff);border-right:1px solid var(--line,#dfe6ef);",
      "box-shadow:12px 0 40px -22px rgba(20,32,51,.6);",
      "font-family:'Public Sans','Helvetica Neue',Arial,sans-serif;color:var(--ink,#142033);font-size:14.5px;",
      "padding-bottom:max(16px,env(safe-area-inset-bottom))}",
    "#bwfPaneel.open{display:block}",
    "#bwfPaneel .kop{padding:14px 18px 6px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;",
      "color:var(--muted,#738097);font-weight:700}",
    "#bwfPaneel a,#bwfPaneel button{display:flex;align-items:center;gap:10px;width:100%;padding:11px 18px;",
      "border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;text-decoration:none}",
    "#bwfPaneel a:hover,#bwfPaneel button:hover{background:var(--surface-2,#f7f9fc)}",
    "#bwfPaneel a.hier{background:var(--accent-soft,#eaf1ff);font-weight:700}",
    "#bwfPaneel a.hier:after{content:'nu';margin-left:auto;font-size:11px;font-weight:400;color:var(--muted,#738097)}",
    "#bwfPaneel .streepje{height:1px;background:var(--line-soft,#edf1f6);margin:8px 0}",

    /* ---- volle breedte op elk formaat ---- */
    ".app,.wrap,.panel,main,.container{max-width:none!important;width:100%!important}",
    ".app,.wrap{margin-inline:0!important;padding-left:clamp(12px,2vw,32px)!important;padding-right:clamp(12px,2vw,32px)!important}",
    ".panel{margin-inline:0!important}",

    /* ---- alles bruikbaar op tablet en telefoon ---- */
    "img,canvas,video,iframe{max-width:100%}",
    "table{width:100%}",
    ".table-wrap,.tabelhouder,.tabel-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}",
    "dialog{max-width:min(760px,calc(100vw - 20px));max-height:calc(100dvh - 24px);overflow:auto}",
    "@media(max-width:900px){",
      ".two-col,.kolommen,.grid-2{grid-template-columns:1fr!important}",
      "iframe{min-height:60vh}",
    "}",
    "@media(max-width:620px){",
      "input,select,textarea{font-size:16px!important}",   /* voorkomt inzoomen op iPhone */
      "button,.btn,.knop,a.btn{min-height:42px}",
      "table{min-width:560px}",
      "#bwfPaneel{width:min(320px,92vw)}",
    "}",
    "@media print{#bwfBalk,#bwfPaneel,#bwfLaag{display:none!important}body{padding-top:0!important}}"
  ].join("");
  (document.head || document.documentElement).appendChild(css);

  /* ---------------- balk ---------------- */
  function icoon(d){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }
  var balk = document.createElement("header");
  balk.id = "bwfBalk";
  balk.innerHTML =
    '<button type="button" id="bwfMenuBtn" aria-haspopup="true" aria-expanded="false">' +
      icoon('<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>') +
      '<span class="bwflabel">Menu</span></button>' +
    '<button type="button" id="bwfTerugBtn">' +
      icoon('<path d="M15 5l-7 7 7 7"/>') + '<span class="bwflabel">Terug</span></button>' +
    '<span class="bwftitel" id="bwfTitel"></span>' +
    '<a class="bwfknop bwfhome" href="' + HOME + '" id="bwfHomeBtn">' +
      icoon('<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/>') +
      '<span class="bwflabel">Home</span></a>';

  var laag = document.createElement("div"); laag.id = "bwfLaag";
  var paneel = document.createElement("nav"); paneel.id = "bwfPaneel";
  paneel.setAttribute("aria-label", "Hoofdmenu");

  /* ---------------- menu vullen ---------------- */
  function paginaNaam(){
    for (var g = 0; g < PAGINAS.length; g++)
      for (var i = 0; i < PAGINAS[g].items.length; i++)
        if (PAGINAS[g].items[i].bestand.toLowerCase() === hier) return PAGINAS[g].items[i].naam;
    return (document.title || "").split("—")[0].trim() || "BWF";
  }

  function vulPaneel(){
    var h = "";
    for (var g = 0; g < PAGINAS.length; g++) {
      h += '<div class="kop">' + PAGINAS[g].groep + "</div>";
      for (var i = 0; i < PAGINAS[g].items.length; i++) {
        var p = PAGINAS[g].items[i];
        var nu = p.bestand.toLowerCase() === hier;
        h += '<a href="' + p.bestand + '"' + (nu ? ' class="hier" aria-current="page"' : "") + ">" + p.naam + "</a>";
      }
      if (g < PAGINAS.length - 1) h += '<div class="streepje"></div>';
    }

    /* heeft deze pagina eigen tabbladen? dan die er onder */
    var knoppen = document.querySelectorAll(
      "nav.tabs button[data-tab], .tabs button[data-tab], [role='tablist'] button[data-tab]");
    if (knoppen.length > 1) {
      h += '<div class="streepje"></div><div class="kop">Op deze pagina</div>';
      for (var k = 0; k < knoppen.length; k++) {
        var t = (knoppen[k].textContent || "").replace(/\s+/g, " ").trim();
        h += '<button type="button" data-ga="' + k + '">' + t + "</button>";
      }
    }
    paneel.innerHTML = h;
  }

  paneel.addEventListener("click", function(e){
    var b = e.target.closest("[data-ga]");
    if (!b) return;
    var knoppen = document.querySelectorAll(
      "nav.tabs button[data-tab], .tabs button[data-tab], [role='tablist'] button[data-tab]");
    var doel = knoppen[parseInt(b.getAttribute("data-ga"), 10)];
    if (doel) doel.click();
    sluit();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  function open(){
    vulPaneel();
    paneel.classList.add("open"); laag.classList.add("open");
    document.getElementById("bwfMenuBtn").setAttribute("aria-expanded", "true");
  }
  function sluit(){
    paneel.classList.remove("open"); laag.classList.remove("open");
    var b = document.getElementById("bwfMenuBtn");
    if (b) b.setAttribute("aria-expanded", "false");
  }

  /* ---------------- plaatsen ---------------- */
  function plaats(){
    document.body.appendChild(laag);
    document.body.appendChild(paneel);
    document.body.appendChild(balk);
    document.getElementById("bwfTitel").textContent = paginaNaam();

    document.getElementById("bwfMenuBtn").addEventListener("click", function(){
      paneel.classList.contains("open") ? sluit() : open();
    });

    document.getElementById("bwfTerugBtn").addEventListener("click", function(){
      /* eerst een open venster sluiten, dan pas echt terug */
      var dlg = document.querySelector("dialog[open]");
      if (dlg) { dlg.close(); return; }
      if (history.length > 1) history.back();
      else location.href = HOME;
    });

    laag.addEventListener("click", sluit);
    document.addEventListener("keydown", function(e){ if (e.key === "Escape") sluit(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", plaats);
  else plaats();
})();
