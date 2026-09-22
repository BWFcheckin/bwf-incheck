/* ===========================================================================
   Kalender of lijst — één keuze, op elke pagina hetzelfde
   ---------------------------------------------------------------------------
   Angela, 22-09-2026: "graag alle planningen in kalenderweergave op elke
   pagina, met een dropdown voor de lijstweergave."

   Op het locatiedashboard, in vr2 en op het portaal stonden de kalender en de
   lijst allebei tegelijk op het scherm, elk net even anders opgebouwd. Dat
   leest als twee overzichten van hetzelfde, en op een telefoon moet je langs
   de hele kalender scrollen voordat je bij de lijst bent.

   Beide blokken bestonden al. Dit bestand voegt alleen de keuze toe: een
   uitklapmenu dat het ene toont en het andere verbergt. De kalender staat
   voorop, want dat vroeg Angela; wie liever een lijst leest zet hem om en dat
   onthoudt het apparaat.

   Gebruik:
     BWFPlanWeergave.maak({
       kop:       waar het menu komt te staan
       kalender:  het blok met de kalender
       lijst:     het blok met de lijst
       sleutel:   naam om de keuze onder te onthouden
       extra:     (mag leeg) blokken die alleen bij de lijst horen,
                  bijvoorbeeld een zoekbalk
       bijWissel: (mag leeg) wordt aangeroepen na het omzetten, voor een
                  kalender die zich pas goed tekent als hij zichtbaar is
     });

   Werkt met losse elementen of met een CSS-selector; ontbreekt een blok, dan
   gebeurt er niets in plaats van een foutmelding.
   =========================================================================== */
(function () {
  "use strict";

  function el(wat) {
    if (!wat) return null;
    return typeof wat === "string" ? document.querySelector(wat) : wat;
  }
  function alle(wat) {
    if (!wat) return [];
    if (typeof wat === "string") return [].slice.call(document.querySelectorAll(wat));
    return [].concat(wat).map(el).filter(Boolean);
  }

  /* De keuze staat per pagina apart opgeslagen. Het dashboard en het portaal
     tonen niet hetzelfde, dus daar wil je ook niet dezelfde stand. */
  function gelezen(sleutel) {
    try { return localStorage.getItem(sleutel) || ""; } catch (e) { return ""; }
  }
  function bewaar(sleutel, waarde) {
    try { localStorage.setItem(sleutel, waarde); } catch (e) { /* privémodus */ }
  }

  function stijl() {
    if (document.getElementById("bwf-planweergave-stijl")) return;
    var s = document.createElement("style");
    s.id = "bwf-planweergave-stijl";
    s.textContent = [
      ".bwf-wk{display:inline-flex;align-items:center;gap:7px;margin-left:auto;flex:none}",
      ".bwf-wk label{font-size:11px;letter-spacing:.09em;text-transform:uppercase;",
      "  opacity:.65;font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace}",
      ".bwf-wk select{font:inherit;font-size:13.5px;padding:6px 10px;border-radius:8px;",
      "  border:1px solid var(--line,#d9d2c8);background:var(--surface,#fff);color:inherit;",
      "  cursor:pointer;min-height:34px}",
      ".bwf-wk select:focus-visible{outline:2px solid currentColor;outline-offset:2px}",
      /* Op een smal scherm mag het menu onder de kop vallen in plaats van de
         titel weg te drukken. */
      "@media(max-width:520px){.bwf-wk{margin-left:0;width:100%}.bwf-wk select{flex:1}}"
    ].join("");
    document.head.appendChild(s);
  }

  function maak(opties) {
    opties = opties || {};
    var kop = el(opties.kop);
    var kalender = el(opties.kalender);
    var lijst = el(opties.lijst);
    /* Zonder twee blokken valt er niets te kiezen. Stil stoppen: deze module
       draait op meerdere pagina's en niet elke pagina heeft allebei. */
    if (!kop || !kalender || !lijst) return null;

    var extra = alle(opties.extra);
    var sleutel = opties.sleutel || "bwf-planweergave";
    var stand = gelezen(sleutel) === "lijst" ? "lijst" : "kalender";

    stijl();

    var houder = document.createElement("div");
    houder.className = "bwf-wk";
    var id = sleutel.replace(/[^a-z0-9]+/gi, "-") + "-keuze";
    houder.innerHTML =
      '<label for="' + id + '">Weergave</label>' +
      '<select id="' + id + '">' +
      '<option value="kalender">Kalender</option>' +
      '<option value="lijst">Lijst</option>' +
      "</select>";
    kop.appendChild(houder);

    var keuze = houder.querySelector("select");

    function toon() {
      var kal = stand === "kalender";
      kalender.hidden = !kal;
      lijst.hidden = kal;
      extra.forEach(function (e) { e.hidden = kal; });
      keuze.value = stand;
      /* Een kalender die verborgen was kent zijn eigen breedte niet; sommige
         tekenen zich pas goed zodra ze zichtbaar zijn. Daarom krijgt de pagina
         na elke wissel de kans zichzelf opnieuw te tekenen. */
      if (typeof opties.bijWissel === "function") {
        try { opties.bijWissel(stand); } catch (e) {}
      }
    }

    keuze.addEventListener("change", function () {
      stand = keuze.value === "lijst" ? "lijst" : "kalender";
      bewaar(sleutel, stand);
      toon();
    });

    toon();
    return { toon: toon, stand: function () { return stand; } };
  }

  window.BWFPlanWeergave = { maak: maak };
})();
