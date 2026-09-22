/* ============================================================
   BWF — kleuren en lettergrootte per persoon
   ------------------------------------------------------------
   Angela, 22-09-2026: "geef de mogelijkheid om de kleuren aan te passen van
   het dashboard, volledig kleurenpakket, en standaard een witte achtergrond in
   lichte modus. Geef de mogelijkheid de grootte van het lettertype aan te
   passen."

   Opnemen is genoeg; er verschijnt een knop in de menubalk:

       <script src="bwf-weergave.js?v=1"></script>

   De keuze staat op het apparaat zelf (localStorage), niet in de database.
   Dat is bewust: het gaat om hoe jíj het scherm wilt zien, en iedereen deelt
   hier dezelfde inlog van het team. Zou het in de database staan, dan verzette
   de een de kleuren van de ander.

   Wat er wordt gezet zijn de CSS-variabelen die de schermen toch al gebruiken:
   --bg, --surface, --line, --ink, --groen, --goud en de bijbehorende namen uit
   de portaalstijl. Daardoor werkt het op elk scherm zonder dat daar iets voor
   hoeft te veranderen.
   ============================================================ */
(function () {
  "use strict";

  if (window.self !== window.top) return;      /* niet in een ingesloten venster */

  var SLEUTEL = "bwf-weergave";

  /* De zes pakketten. "Licht" is de standaard en heeft een echt witte
     achtergrond, zoals Angela vroeg - de schermen stonden op gebroken wit. */
  var PAKKETTEN = {
    licht: {
      naam: "Licht", stip: "#ffffff",
      kleuren: {
        "--bg": "#ffffff", "--achtergrond": "#ffffff", "--surface": "#ffffff",
        "--surface-2": "#f7f7f5", "--kaart": "#ffffff", "--vlak": "#ffffff",
        "--zacht": "#f7f7f5", "--line": "#e6e3dd", "--lijn": "#e6e3dd",
        "--ink": "#1d2420", "--tekst": "#1d2420", "--muted": "#6b6f6c"
      }
    },
    warm: {
      naam: "Warm (nu)", stip: "#f7f5f1",
      kleuren: {
        "--bg": "#f7f5f1", "--achtergrond": "#f7f5f1", "--surface": "#ffffff",
        "--surface-2": "#faf7f3", "--kaart": "#ffffff", "--vlak": "#ffffff",
        "--zacht": "#faf7f3", "--line": "#e3dad0", "--lijn": "#e3dad0",
        "--ink": "#1d2420", "--tekst": "#1d2420", "--muted": "#6b6f6c"
      }
    },
    zand: {
      naam: "Zand", stip: "#f2ece1",
      kleuren: {
        "--bg": "#f2ece1", "--achtergrond": "#f2ece1", "--surface": "#fdfbf7",
        "--surface-2": "#f7f2e8", "--kaart": "#fdfbf7", "--vlak": "#fdfbf7",
        "--zacht": "#f7f2e8", "--line": "#ddd2bf", "--lijn": "#ddd2bf",
        "--ink": "#2b2418", "--tekst": "#2b2418", "--muted": "#6f6553"
      }
    },
    koel: {
      naam: "Koel", stip: "#eef2f5",
      kleuren: {
        "--bg": "#eef2f5", "--achtergrond": "#eef2f5", "--surface": "#ffffff",
        "--surface-2": "#f5f8fa", "--kaart": "#ffffff", "--vlak": "#ffffff",
        "--zacht": "#f5f8fa", "--line": "#d8e0e6", "--lijn": "#d8e0e6",
        "--ink": "#18232b", "--tekst": "#18232b", "--muted": "#5d6b75"
      }
    },
    donker: {
      naam: "Donker", stip: "#1c211f",
      kleuren: {
        "--bg": "#161a19", "--achtergrond": "#161a19", "--surface": "#1f2523",
        "--surface-2": "#262d2a", "--kaart": "#1f2523", "--vlak": "#1f2523",
        "--zacht": "#262d2a", "--line": "#333b38", "--lijn": "#333b38",
        "--ink": "#eceeed", "--tekst": "#eceeed", "--muted": "#9aa5a0"
      }
    },
    contrast: {
      naam: "Veel contrast", stip: "#000000",
      kleuren: {
        "--bg": "#ffffff", "--achtergrond": "#ffffff", "--surface": "#ffffff",
        "--surface-2": "#ffffff", "--kaart": "#ffffff", "--vlak": "#ffffff",
        "--zacht": "#f0f0f0", "--line": "#000000", "--lijn": "#000000",
        "--ink": "#000000", "--tekst": "#000000", "--muted": "#333333"
      }
    }
  };

  /* De accentkleur staat los van het pakket: die bepaalt de knoppen en de
     menubalk, en daar heeft iedereen een eigen voorkeur in. */
  var ACCENTEN = {
    groen:  { naam: "Groen",  kleur: "#14342A", balk: "#483C34" },
    bruin:  { naam: "Bruin",  kleur: "#5A4B41", balk: "#483C34" },
    goud:   { naam: "Goud",   kleur: "#9A7B4F", balk: "#6b5533" },
    blauw:  { naam: "Blauw",  kleur: "#1C5B8A", balk: "#16455f" },
    paars:  { naam: "Paars",  kleur: "#5B3C7A", balk: "#463059" },
    zwart:  { naam: "Zwart",  kleur: "#222222", balk: "#2b2b2b" }
  };

  var LETTERS = [
    { naam: "Klein",       waarde: 0.92 },
    { naam: "Normaal",     waarde: 1 },
    { naam: "Groot",       waarde: 1.12 },
    { naam: "Extra groot", waarde: 1.26 }
  ];

  function lees() {
    try {
      var v = JSON.parse(localStorage.getItem(SLEUTEL) || "null");
      if (v && typeof v === "object") return v;
    } catch (e) {}
    return {};
  }
  function bewaar(v) {
    try { localStorage.setItem(SLEUTEL, JSON.stringify(v)); } catch (e) {}
  }

  /* De instelling toepassen op de pagina. Wordt bij elke wijziging opnieuw
     aangeroepen en ook meteen bij het laden, zodat je nooit even de oude
     kleuren ziet opflitsen. */
  function pasToe() {
    var v = lees();
    var wortel = document.documentElement;
    var pak = PAKKETTEN[v.pakket] || PAKKETTEN.licht;
    Object.keys(pak.kleuren).forEach(function (naam) {
      wortel.style.setProperty(naam, pak.kleuren[naam]);
    });
    var acc = ACCENTEN[v.accent] || ACCENTEN.groen;
    wortel.style.setProperty("--groen", acc.kleur);
    wortel.style.setProperty("--groen-2", acc.kleur);
    wortel.style.setProperty("--accent", acc.kleur);
    wortel.style.setProperty("--bwfmenu-kleur", acc.balk);

    var maat = Number(v.letter) || 1;
    wortel.style.setProperty("--bwf-letter", String(maat));
    /* 16px is de gewone maat van een browser; alles wat in em of rem staat
       schaalt mee. Schermen met een vaste pixelmaat op body volgen niet, maar
       die zijn in de minderheid. */
    wortel.style.fontSize = Math.round(16 * maat) + "px";

    wortel.setAttribute("data-bwf-pakket", v.pakket || "licht");
    if ((v.pakket || "licht") === "donker") wortel.style.colorScheme = "dark";
    else wortel.style.colorScheme = "light";
  }

  pasToe();   /* meteen, vóór het tekenen van het venster */

  var CSS = [
    "#bwfWeergave{position:fixed;inset:0;z-index:9600;display:none;",
      "background:rgba(20,16,12,.42);align-items:center;justify-content:center;padding:18px}",
    "#bwfWeergave.open{display:flex}",
    "#bwfWeergave .doos{background:#fff;color:#1d2420;border-radius:16px;max-width:420px;width:100%;",
      "max-height:86vh;overflow-y:auto;padding:20px 22px;",
      "font:15px/1.5 'Public Sans','Helvetica Neue',Arial,sans-serif;box-shadow:0 24px 60px -20px rgba(0,0,0,.5)}",
    "#bwfWeergave h2{margin:0 0 4px;font-size:19px}",
    "#bwfWeergave p.uit{margin:0 0 16px;font-size:13px;opacity:.7}",
    "#bwfWeergave h3{margin:16px 0 7px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.6}",
    "#bwfWeergave .keuzes{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px}",
    "#bwfWeergave .keuze{display:flex;align-items:center;gap:8px;padding:9px 11px;border-radius:11px;",
      "border:1.5px solid #e6e3dd;background:#fff;cursor:pointer;font:inherit;font-size:13.5px;text-align:left}",
    "#bwfWeergave .keuze:hover{border-color:#9A7B4F}",
    "#bwfWeergave .keuze[aria-pressed=\"true\"]{border-color:#14342A;background:#f2f6f4;font-weight:600}",
    "#bwfWeergave .stip{width:18px;height:18px;border-radius:50%;flex:none;border:1px solid rgba(0,0,0,.14)}",
    "#bwfWeergave .voet{display:flex;gap:9px;margin-top:20px;align-items:center}",
    "#bwfWeergave .voet button{font:inherit;font-size:14px;padding:9px 16px;border-radius:10px;cursor:pointer}",
    "#bwfWeergave .klaar{background:#14342A;color:#fff;border:0;margin-left:auto}",
    "#bwfWeergave .herstel{background:none;border:1px solid #e6e3dd;color:#1d2420}",
    ".bwf-topmenu .bwfweergave{font:inherit;font-size:12.5px;padding:4px 10px;border-radius:999px;",
      "border:1px solid rgba(255,255,255,.28);background:none;color:rgba(255,255,255,.88);",
      "cursor:pointer;margin-left:6px}",
    ".bwf-topmenu .bwfweergave:hover{background:rgba(255,255,255,.16);color:#fff}"
  ].join("");

  function zetCss() {
    if (document.getElementById("bwfWeergaveStijl")) return;
    var s = document.createElement("style");
    s.id = "bwfWeergaveStijl";
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function teken() {
    var v = lees();
    var vak = document.getElementById("bwfWeergave");
    if (!vak) return;
    var pakKeuze = Object.keys(PAKKETTEN).map(function (k) {
      return '<button class="keuze" type="button" data-pakket="' + k + '" aria-pressed="' +
        ((v.pakket || "licht") === k) + '"><span class="stip" style="background:' +
        PAKKETTEN[k].stip + '"></span>' + esc(PAKKETTEN[k].naam) + "</button>";
    }).join("");
    var accKeuze = Object.keys(ACCENTEN).map(function (k) {
      return '<button class="keuze" type="button" data-accent="' + k + '" aria-pressed="' +
        ((v.accent || "groen") === k) + '"><span class="stip" style="background:' +
        ACCENTEN[k].kleur + '"></span>' + esc(ACCENTEN[k].naam) + "</button>";
    }).join("");
    var letKeuze = LETTERS.map(function (l) {
      return '<button class="keuze" type="button" data-letter="' + l.waarde + '" aria-pressed="' +
        (Math.abs((Number(v.letter) || 1) - l.waarde) < 0.001) + '">' + esc(l.naam) + "</button>";
    }).join("");

    vak.querySelector(".doos").innerHTML =
      "<h2>Weergave</h2>" +
      '<p class="uit">Deze keuze geldt alleen op dit apparaat, voor jou. ' +
      "Je collega&#39;s zien hun eigen instelling.</p>" +
      "<h3>Achtergrond</h3>" + '<div class="keuzes">' + pakKeuze + "</div>" +
      "<h3>Accentkleur</h3>" + '<div class="keuzes">' + accKeuze + "</div>" +
      "<h3>Lettergrootte</h3>" + '<div class="keuzes">' + letKeuze + "</div>" +
      '<div class="voet"><button class="herstel" type="button" data-herstel>Terug naar standaard</button>' +
      '<button class="klaar" type="button" data-sluit>Klaar</button></div>';
  }

  function open() {
    zetCss();
    var vak = document.getElementById("bwfWeergave");
    if (!vak) {
      vak = document.createElement("div");
      vak.id = "bwfWeergave";
      vak.innerHTML = '<div class="doos"></div>';
      document.body.appendChild(vak);
      vak.addEventListener("click", function (e) {
        if (e.target === vak) { vak.classList.remove("open"); return; }
        var k = e.target.closest("button");
        if (!k) return;
        var v = lees();
        if (k.dataset.pakket) v.pakket = k.dataset.pakket;
        else if (k.dataset.accent) v.accent = k.dataset.accent;
        else if (k.dataset.letter) v.letter = Number(k.dataset.letter);
        else if (k.dataset.herstel !== undefined) v = {};
        else if (k.dataset.sluit !== undefined) { vak.classList.remove("open"); return; }
        bewaar(v);
        pasToe();
        teken();
      });
    }
    teken();
    vak.classList.add("open");
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var vak = document.getElementById("bwfWeergave");
    if (vak) vak.classList.remove("open");
  });

  /* De knop in de menubalk. Die balk wordt door bwf-menu.js gebouwd en dat
     bestand staat soms verderop in de pagina, dus even wachten tot hij er is. */
  function haakAan() {
    var pogingen = 0;
    (function probeer() {
      var rij = document.querySelector(".bwf-topmenu .rij.paginas") ||
                document.querySelector(".bwf-topmenu .binnen");
      if (rij && !document.getElementById("bwfWeergaveKnop")) {
        zetCss();
        var knop = document.createElement("button");
        knop.type = "button";
        knop.id = "bwfWeergaveKnop";
        knop.className = "bwfweergave";
        knop.title = "Kleuren en lettergrootte aanpassen";
        knop.textContent = "Weergave";
        knop.addEventListener("click", open);
        rij.appendChild(knop);
        return;
      }
      if (++pogingen < 40) setTimeout(probeer, 100);
    })();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", haakAan);
  else haakAan();
  /* De menubalk bouwt zichzelf opnieuw op zodra de rol bekend is, en veegt
     deze knop dan weg. Op dat seintje hangen we hem er opnieuw in. */
  window.addEventListener("bwf-balk-klaar", haakAan);

  window.BWFWeergave = { open: open, pasToe: pasToe };
})();
