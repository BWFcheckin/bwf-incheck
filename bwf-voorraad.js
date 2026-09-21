/* ============================================================
   BWF — voorraad en bestellingen, voor elk scherm hetzelfde
   ------------------------------------------------------------
   Angela, 21-09-2026: "ik wil dat de voorraad op elk dashboard zichtbaar en
   aanpasbaar is, maak het makkelijk in te vullen en behoud de gegevens, en
   maak het mogelijk om al te bestellen / al besteld / ontvangen aan te geven
   zodat de voorraad automatisch wordt bijgewerkt."

   Het bestond al, maar op twee plekken tegelijk en allebei net anders: een
   volwaardig scherm in dashboard.html (waar het tabblad zelfs verborgen stond)
   en een eigen kopie in index.html. dagstart.html en dagoverzicht.html konden
   alleen kijken, vr2.html had alleen een link. Vier plaatsen, vier keer
   onderhoud, en nergens kon je het van je telefoon af bijwerken.

   Nu staat het hier, één keer. Opnemen is genoeg:

       <div id="voorraad"></div>
       <script src="bwf-voorraad.js?v=1"></script>
       <script>BWFVoorraad.maak(document.getElementById('voorraad'));</script>

   DE DRIE STAPPEN
   Een artikel loopt langs drie knoppen, en de voorraad rekent zelf mee:

       te bestellen  --[Bestellen]-->  besteld  --[Ontvangen]-->  op peil
                                          |
                                     [Toch niet] -> terug naar te bestellen

   "Bestellen" legt vast hoeveel er besteld is (het bestelaantal, of anders
   automatisch aangevuld tot tweemaal het minimum). "Ontvangen" telt dat aantal
   bij de voorraad op en zet de bestelling weer op nul. Er gaat niets verloren:
   alleen het aantal verandert, de rest van het artikel blijft zoals het was.

   De status is nergens opgeslagen; hij volgt uit het aantal, het minimum en of
   er besteld is. Dat is bewust - zo kan hij niet uit de pas lopen met de
   werkelijkheid.
   ============================================================ */
(function () {
  "use strict";

  var PROJECT = "iuyjvtlauktnjprbmbjj";
  var BASIS = "https://" + PROJECT + ".supabase.co";
  var ANON = "sb_publishable_SfQjQTwKa3BgCtjwE-8ljw_mTpqEY3U";
  var SESSIE_SLEUTEL = "sb-" + PROJECT + "-auth-token";

  /* De kolommen zoals ze in de database heten. min_aantal en bestel_aantal
     heetten in het oude scherm "min" en "bestelAantal"; die vertaling zat
     verspreid door de code en leverde meer dan eens een veld op dat niet werd
     bewaard. Hier gebruiken we overal de databasenamen. */
  var KOLOMMEN = "id,naam,categorie,aantal,min_aantal,leverancier,besteld," +
    "bestel_aantal,verwacht,locatie,aangemaakt";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function getal(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }

  /* ---------- verbinding ---------- */
  var verversBezig = null;
  function jwtDeel(t) {
    try { return JSON.parse(atob(String(t).split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); }
    catch (e) { return {}; }
  }
  function token() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(SESSIE_SLEUTEL) || "null"); } catch (e) {}
    if (!s || !s.access_token) {
      /* vr2 bewaart zijn sessie onder een eigen naam */
      try {
        var w = JSON.parse(localStorage.getItem("wz_sessie") || "null");
        if (w && w.token) return Promise.resolve(w.token);
      } catch (e2) {}
      return Promise.resolve(null);
    }
    if (((jwtDeel(s.access_token).exp || 0) * 1000) - Date.now() > 60000) {
      return Promise.resolve(s.access_token);
    }
    if (!s.refresh_token) return Promise.resolve(null);
    if (!verversBezig) {
      verversBezig = fetch(BASIS + "/auth/v1/token?grant_type=refresh_token", {
        method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: s.refresh_token })
      }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !d.access_token) return null;
          try { localStorage.setItem(SESSIE_SLEUTEL, JSON.stringify(d)); } catch (e) {}
          return d.access_token;
        }).catch(function () { return null; })
        .then(function (t) { verversBezig = null; return t; });
    }
    return verversBezig;
  }

  function api(pad, opties) {
    opties = opties || {};
    return token().then(function (t) {
      if (!t) throw new Error("Log eerst in om de voorraad te zien.");
      var kop = { apikey: ANON, Authorization: "Bearer " + t };
      if (opties.body) {
        kop["Content-Type"] = "application/json";
        kop.Prefer = opties.prefer || "return=representation";
      }
      return fetch(BASIS + "/rest/v1/" + pad, {
        method: opties.method || "GET", headers: kop, body: opties.body
      });
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) {
        throw new Error("fout " + r.status + (t ? " — " + t.slice(0, 120) : ""));
      });
      return r.text().then(function (t) { return t ? JSON.parse(t) : null; });
    });
  }

  /* ---------- rekenen ---------- */

  /* Hoeveel er besteld moet worden. Staat er een bestelaantal, dan dat; anders
     aanvullen tot tweemaal het minimum, en altijd minstens één. Dezelfde
     formule als in het oude scherm, zodat de bestellijsten hetzelfde blijven. */
  function teBestellen(v) {
    var eigen = getal(v.bestel_aantal);
    if (eigen > 0) return eigen;
    return Math.max(getal(v.min_aantal) * 2 - getal(v.aantal), 1);
  }

  function stand(v) {
    if (v.besteld) return { sleutel: "besteld", tekst: "Besteld", kleur: "#1C6FD0" };
    if (getal(v.aantal) <= 0) return { sleutel: "op", tekst: "Op", kleur: "#B3261E" };
    if (getal(v.aantal) <= getal(v.min_aantal)) return { sleutel: "bestellen", tekst: "Bestellen", kleur: "#9A7B4F" };
    return { sleutel: "peil", tekst: "Op peil", kleur: "#0F7B5A" };
  }

  /* "Arrangement" en "arrangement" stonden als twee categorieën in de lijst.
     Voor het groeperen en filteren tellen ze als één; wat er in het veld staat
     blijft staan zoals iemand het heeft getypt. */
  function catSleutel(v) { return String(v.categorie || "").trim().toLowerCase() || "overig"; }
  function catNaam(v) {
    var s = String(v.categorie || "").trim();
    if (!s) return "Overig";
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* ---------- opmaak ---------- */
  var CSS = [
    ".bwfv{--v-lijn:#e3dad0;--v-vlak:#fff;--v-zacht:#faf7f3;font-size:14px;color:inherit}",
    ".bwfv *{box-sizing:border-box}",
    ".bwfv-tegels{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:14px}",
    ".bwfv-tegel{background:var(--v-vlak);border:1px solid var(--v-lijn);border-left:4px solid var(--k);",
      "border-radius:12px;padding:10px 12px;text-align:left;cursor:pointer;font:inherit}",
    ".bwfv-tegel[aria-pressed=\"true\"]{background:#3B322B;color:#fff;border-color:#3B322B}",
    ".bwfv-tegel b{display:block;font-size:24px;line-height:1.1}",
    ".bwfv-tegel span{display:block;font-size:12.5px;opacity:.75}",
    ".bwfv-balk{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}",
    ".bwfv input,.bwfv select{font:inherit;font-size:14px;padding:7px 10px;border:1px solid var(--v-lijn);",
      "border-radius:9px;background:var(--v-vlak);color:inherit;min-width:0}",
    ".bwfv-zoek{flex:1 1 180px}",
    ".bwfv-groep{margin-bottom:16px}",
    ".bwfv-groep h4{margin:0 0 6px;font-size:12px;letter-spacing:.09em;text-transform:uppercase;opacity:.6}",
    ".bwfv-rij{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;background:var(--v-vlak);",
      "border:1px solid var(--v-lijn);border-left:4px solid var(--k);border-radius:12px;padding:10px 12px;margin-bottom:7px}",
    ".bwfv-naam{font-weight:600;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}",
    ".bwfv-naam small{font-weight:400;opacity:.62;font-size:12px}",
    ".bwfv-pil{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;",
      "color:#fff;background:var(--k);border-radius:999px;padding:1px 8px}",
    ".bwfv-tel{display:flex;align-items:center;gap:4px}",
    ".bwfv-tel button{width:34px;height:34px;border-radius:9px;border:1px solid var(--v-lijn);",
      "background:var(--v-zacht);font:inherit;font-size:17px;cursor:pointer;line-height:1}",
    ".bwfv-tel button:hover{background:#efe7dd}",
    ".bwfv-tel input{width:56px;text-align:center;padding:7px 4px}",
    ".bwfv-acties{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;grid-column:1/-1}",
    ".bwfv-acties button{font:inherit;font-size:13px;padding:7px 13px;border-radius:9px;cursor:pointer;",
      "border:1px solid var(--v-lijn);background:var(--v-zacht)}",
    ".bwfv-acties button.doe{background:#3B322B;border-color:#3B322B;color:#fff}",
    ".bwfv-acties button.ont{background:#0F7B5A;border-color:#0F7B5A;color:#fff}",
    ".bwfv-acties button.weg{margin-left:auto;border-color:transparent;background:none;opacity:.5}",
    ".bwfv-acties button.weg:hover{opacity:1;color:#B3261E}",
    ".bwfv-meer{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;",
      "grid-column:1/-1;margin-top:8px;padding-top:8px;border-top:1px dashed var(--v-lijn)}",
    ".bwfv-meer label{display:flex;flex-direction:column;gap:3px;font-size:11.5px;opacity:.75}",
    ".bwfv-nieuw{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;align-items:end;",
      "background:var(--v-zacht);border:1px solid var(--v-lijn);border-radius:12px;padding:12px;margin-bottom:14px}",
    ".bwfv-nieuw label{display:flex;flex-direction:column;gap:3px;font-size:11.5px;opacity:.75}",
    ".bwfv-nieuw button{font:inherit;font-size:14px;padding:8px 16px;border-radius:9px;border:0;",
      "background:#3B322B;color:#fff;cursor:pointer}",
    ".bwfv-melding{font-size:13px;padding:8px 12px;border-radius:9px;margin-bottom:10px}",
    ".bwfv-melding.ok{background:#e8f3ee;color:#0F7B5A}",
    ".bwfv-melding.fout{background:#fae9e7;color:#B3261E}",
    ".bwfv-leeg{opacity:.6;font-size:13.5px;padding:10px 2px}",
    "@media(max-width:560px){.bwfv-rij{grid-template-columns:1fr}.bwfv-tel{justify-content:flex-start}}",
    "@media print{.bwfv-acties,.bwfv-balk,.bwfv-nieuw,.bwfv-tegel{display:none}}"
  ].join("");

  var cssGezet = false;
  function zetCss() {
    if (cssGezet) return;
    cssGezet = true;
    var s = document.createElement("style");
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ============================================================
     maak(element, opties)
     opties.compact  - alleen wat aandacht nodig heeft, zonder bewerkvelden
     opties.locatie  - voorlopig niet gebruikt; de kolom staat nog overal leeg
     ============================================================ */
  function maak(el, opties) {
    if (!el) return null;
    opties = opties || {};
    zetCss();
    el.classList.add("bwfv");

    var st = {
      items: [],
      zoek: "",
      cat: "",
      filter: opties.compact ? "aandacht" : "",
      open: {},                 /* welke rijen hun extra velden tonen */
      bezig: false,
      melding: null
    };

    function melden(tekst, soort) {
      st.melding = tekst ? { tekst: tekst, soort: soort || "ok" } : null;
      teken();
      if (tekst) setTimeout(function () {
        if (st.melding && st.melding.tekst === tekst) { st.melding = null; teken(); }
      }, 4000);
    }

    function haal() {
      return api("voorraad?select=" + KOLOMMEN + "&order=categorie.asc,naam.asc&limit=1000")
        .then(function (r) { st.items = r || []; teken(); })
        .catch(function (e) {
          el.innerHTML = '<p class="bwfv-leeg">' + esc(e.message) + "</p>";
        });
    }

    /* Eén veld van één artikel wegschrijven. Het scherm toont de nieuwe waarde
       meteen; mislukt het opslaan, dan gaat hij terug en zie je waarom. Zo
       staat er nooit iets op het scherm dat niet in de database staat. */
    function bewaar(id, wijziging, watTerug) {
      var i = st.items.findIndex(function (x) { return String(x.id) === String(id); });
      if (i < 0) return Promise.resolve();
      var oud = {};
      Object.keys(wijziging).forEach(function (k) { oud[k] = st.items[i][k]; });
      Object.assign(st.items[i], wijziging);
      teken();
      return api("voorraad?id=eq." + encodeURIComponent(id) + "&select=" + KOLOMMEN,
        { method: "PATCH", body: JSON.stringify(wijziging) })
        .then(function (rij) {
          if (rij && rij[0]) { st.items[i] = rij[0]; teken(); }
          if (watTerug) melden(watTerug, "ok");
        })
        .catch(function (e) {
          Object.assign(st.items[i], oud);
          melden("Opslaan lukte niet: " + e.message, "fout");
        });
    }

    /* ---------- tekenen ---------- */

    function zichtbaar() {
      var z = st.zoek.toLowerCase();
      return st.items.filter(function (v) {
        if (st.cat && catSleutel(v) !== st.cat) return false;
        if (z && (String(v.naam || "") + " " + String(v.leverancier || ""))
            .toLowerCase().indexOf(z) < 0) return false;
        var s = stand(v).sleutel;
        if (st.filter === "aandacht") return s === "bestellen" || s === "op";
        if (st.filter && s !== st.filter) return false;
        return true;
      });
    }

    function tegelsHtml() {
      var t = { peil: 0, bestellen: 0, besteld: 0, op: 0 };
      st.items.forEach(function (v) { t[stand(v).sleutel]++; });
      var rijen = [
        { s: "", n: st.items.length, w: "Artikelen", k: "#3B322B" },
        { s: "bestellen", n: t.bestellen, w: "Te bestellen", k: "#9A7B4F" },
        { s: "besteld", n: t.besteld, w: "Besteld", k: "#1C6FD0" },
        { s: "op", n: t.op, w: "Op", k: "#B3261E" }
      ];
      return '<div class="bwfv-tegels">' + rijen.map(function (r) {
        return '<button class="bwfv-tegel" type="button" style="--k:' + r.k + '" data-stand="' + r.s +
          '" aria-pressed="' + (st.filter === r.s ? "true" : "false") + '">' +
          "<b>" + r.n + "</b><span>" + esc(r.w) + "</span></button>";
      }).join("") + "</div>";
    }

    function balkHtml() {
      var cats = {};
      st.items.forEach(function (v) { cats[catSleutel(v)] = catNaam(v); });
      var opties = Object.keys(cats).sort().map(function (k) {
        return '<option value="' + esc(k) + '"' + (st.cat === k ? " selected" : "") + ">" +
          esc(cats[k]) + "</option>";
      }).join("");
      return '<div class="bwfv-balk">' +
        '<input class="bwfv-zoek" type="search" placeholder="Zoek een artikel of leverancier" ' +
          'value="' + esc(st.zoek) + '" data-zoek>' +
        '<select data-cat><option value="">Alle categorieën</option>' + opties + "</select>" +
        '<button type="button" class="bwfv-tegel" style="--k:#9A7B4F;padding:7px 13px" data-bestellijst>' +
          "Bestellijst</button></div>";
    }

    function rijHtml(v) {
      var s = stand(v);
      var open = !!st.open[v.id];
      var nodig = teBestellen(v);
      var h = '<div class="bwfv-rij" style="--k:' + s.kleur + '" data-rij="' + esc(v.id) + '">' +
        '<div><div class="bwfv-naam">' +
          '<span class="bwfv-pil">' + esc(s.tekst) + "</span>" + esc(v.naam || "zonder naam") +
          (v.leverancier ? "<small>" + esc(v.leverancier) + "</small>" : "") +
          (v.besteld && v.verwacht ? "<small>verwacht " + esc(v.verwacht) + "</small>" : "") +
        "</div></div>" +
        '<div class="bwfv-tel">' +
          '<button type="button" data-af="' + esc(v.id) + '" title="Eentje eraf" aria-label="Eentje eraf">&minus;</button>' +
          '<input type="number" min="0" step="1" value="' + getal(v.aantal) +
            '" data-aantal="' + esc(v.id) + '" aria-label="Aantal ' + esc(v.naam) + '">' +
          '<button type="button" data-bij="' + esc(v.id) + '" title="Eentje erbij" aria-label="Eentje erbij">+</button>' +
        "</div>";

      if (!opties.compact) {
        h += '<div class="bwfv-acties">' +
          (v.besteld
            ? '<button type="button" class="ont" data-ontvangen="' + esc(v.id) + '">Ontvangen (+' + nodig + ")</button>" +
              '<button type="button" data-terug="' + esc(v.id) + '">Toch niet besteld</button>'
            : '<button type="button" class="doe" data-bestellen="' + esc(v.id) + '">Bestellen (' + nodig + ")</button>") +
          '<button type="button" data-open="' + esc(v.id) + '">' + (open ? "Minder" : "Meer") + "</button>" +
          '<button type="button" class="weg" data-weg="' + esc(v.id) + '" title="Verwijderen">&#10007;</button>' +
        "</div>";

        if (open) {
          h += '<div class="bwfv-meer">' +
            '<label>Naam<input type="text" value="' + esc(v.naam || "") + '" data-veld="naam" data-id="' + esc(v.id) + '"></label>' +
            '<label>Categorie<input type="text" value="' + esc(v.categorie || "") + '" data-veld="categorie" data-id="' + esc(v.id) + '"></label>' +
            '<label>Leverancier<input type="text" value="' + esc(v.leverancier || "") + '" data-veld="leverancier" data-id="' + esc(v.id) + '"></label>' +
            '<label>Minimum<input type="number" min="0" step="1" value="' + getal(v.min_aantal) + '" data-veld="min_aantal" data-id="' + esc(v.id) + '"></label>' +
            '<label>Bestelaantal<input type="number" min="0" step="1" value="' + getal(v.bestel_aantal) + '" data-veld="bestel_aantal" data-id="' + esc(v.id) + '"></label>' +
            '<label>Verwacht<input type="date" value="' + esc(v.verwacht || "") + '" data-veld="verwacht" data-id="' + esc(v.id) + '"></label>' +
          "</div>";
        }
      }
      return h + "</div>";
    }

    function nieuwHtml() {
      if (opties.compact) return "";
      return '<div class="bwfv-nieuw">' +
        '<label>Nieuw artikel<input type="text" data-n-naam placeholder="Bijv. Handdoeken"></label>' +
        '<label>Categorie<input type="text" data-n-cat placeholder="Bijv. Linnen"></label>' +
        '<label>Aantal<input type="number" min="0" step="1" value="0" data-n-aantal></label>' +
        '<label>Minimum<input type="number" min="0" step="1" value="1" data-n-min></label>' +
        '<label>Leverancier<input type="text" data-n-lev></label>' +
        "<button type=\"button\" data-toevoegen>Toevoegen</button></div>";
    }

    function teken() {
      var lijst = zichtbaar();
      var groepen = {};
      lijst.forEach(function (v) {
        var k = catSleutel(v);
        (groepen[k] = groepen[k] || { naam: catNaam(v), rijen: [] }).rijen.push(v);
      });

      var h = "";
      if (st.melding) {
        h += '<div class="bwfv-melding ' + st.melding.soort + '">' + esc(st.melding.tekst) + "</div>";
      }
      h += tegelsHtml();
      if (!opties.compact) h += balkHtml() + nieuwHtml();

      var sleutels = Object.keys(groepen).sort(function (a, b) {
        return groepen[a].naam.localeCompare(groepen[b].naam);
      });
      if (!sleutels.length) {
        h += '<p class="bwfv-leeg">' +
          (st.items.length ? "Niets gevonden met deze filters." : "Nog geen artikelen.") + "</p>";
      }
      sleutels.forEach(function (k) {
        h += '<div class="bwfv-groep"><h4>' + esc(groepen[k].naam) + " &middot; " +
          groepen[k].rijen.length + "</h4>" +
          groepen[k].rijen.map(rijHtml).join("") + "</div>";
      });
      el.innerHTML = h;
    }

    /* ---------- bedienen ---------- */

    el.addEventListener("click", function (e) {
      var t = e.target.closest("button");
      if (!t || !el.contains(t)) return;
      var d = t.dataset;

      if (d.stand !== undefined) { st.filter = st.filter === d.stand ? "" : d.stand; teken(); return; }
      if (d.bestellijst !== undefined) { bestellijst(); return; }
      if (d.toevoegen !== undefined) { toevoegen(); return; }
      if (d.open) { st.open[d.open] = !st.open[d.open]; teken(); return; }

      var v = st.items.filter(function (x) { return String(x.id) === String(d.bij || d.af || d.bestellen || d.ontvangen || d.terug || d.weg); })[0];
      if (!v) return;

      if (d.bij) { bewaar(v.id, { aantal: getal(v.aantal) + 1 }); return; }
      if (d.af) { bewaar(v.id, { aantal: Math.max(0, getal(v.aantal) - 1) }); return; }

      /* Bestellen: leg vast hoeveel er besteld is, zodat "Ontvangen" later
         precies dat aantal kan bijtellen - ook als het minimum ondertussen is
         veranderd. */
      if (d.bestellen) {
        var nodig = teBestellen(v);
        bewaar(v.id, { besteld: true, bestel_aantal: nodig },
          esc(v.naam) + ": " + nodig + " besteld.");
        return;
      }
      if (d.terug) {
        bewaar(v.id, { besteld: false, verwacht: null }, esc(v.naam) + " staat weer op te bestellen.");
        return;
      }
      /* Ontvangen: het bestelde aantal komt bij de voorraad, de bestelling gaat
         van de lijst. Alleen het aantal verandert; naam, minimum en leverancier
         blijven staan. */
      if (d.ontvangen) {
        var bij = teBestellen(v);
        bewaar(v.id, { aantal: getal(v.aantal) + bij, besteld: false, bestel_aantal: 0, verwacht: null },
          esc(v.naam) + ": " + bij + " ontvangen, nu " + (getal(v.aantal) + bij) + " op voorraad.");
        return;
      }
      if (d.weg) {
        if (!confirm("“" + (v.naam || "dit artikel") + "” verwijderen uit de voorraad?")) return;
        api("voorraad?id=eq." + encodeURIComponent(v.id), { method: "DELETE", prefer: "return=minimal" })
          .then(function () {
            st.items = st.items.filter(function (x) { return String(x.id) !== String(v.id); });
            melden("“" + v.naam + "” is verwijderd.", "ok");
          })
          .catch(function (err) { melden("Verwijderen lukte niet: " + err.message, "fout"); });
      }
    });

    /* change en niet input: pas opslaan als je klaar bent met typen, anders
       gaat er een verzoek per toetsaanslag de deur uit. */
    el.addEventListener("change", function (e) {
      var i = e.target;
      if (!i || !el.contains(i)) return;
      if (i.dataset.aantal) { bewaar(i.dataset.aantal, { aantal: Math.max(0, getal(i.value)) }); return; }
      if (i.dataset.veld && i.dataset.id) {
        var w = {};
        var veld = i.dataset.veld;
        w[veld] = (veld === "min_aantal" || veld === "bestel_aantal") ? Math.max(0, getal(i.value))
          : (veld === "verwacht") ? (i.value || null)
          : i.value.trim();
        bewaar(i.dataset.id, w);
        return;
      }
      if (i.dataset.cat !== undefined) { st.cat = i.value; teken(); return; }
    });

    var zoekWacht = null;
    el.addEventListener("input", function (e) {
      if (e.target.dataset.zoek === undefined) return;
      var waarde = e.target.value;
      clearTimeout(zoekWacht);
      zoekWacht = setTimeout(function () {
        st.zoek = waarde;
        teken();
        var z = el.querySelector("[data-zoek]");
        if (z) { z.focus(); z.setSelectionRange(z.value.length, z.value.length); }
      }, 250);
    });

    function toevoegen() {
      var naam = (el.querySelector("[data-n-naam]") || {}).value || "";
      naam = naam.trim();
      if (!naam) { melden("Vul eerst een naam in.", "fout"); return; }
      var rij = {
        /* de sleutel is tekst en heeft geen standaardwaarde in de database */
        id: "vr-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7),
        naam: naam,
        categorie: ((el.querySelector("[data-n-cat]") || {}).value || "").trim() || null,
        aantal: Math.max(0, getal((el.querySelector("[data-n-aantal]") || {}).value)),
        min_aantal: Math.max(0, getal((el.querySelector("[data-n-min]") || {}).value)),
        leverancier: ((el.querySelector("[data-n-lev]") || {}).value || "").trim() || null,
        besteld: false, bestel_aantal: 0
      };
      api("voorraad?select=" + KOLOMMEN, { method: "POST", body: JSON.stringify(rij) })
        .then(function (r) {
          if (r && r[0]) st.items.push(r[0]);
          melden("“" + naam + "” toegevoegd.", "ok");
        })
        .catch(function (e) { melden("Toevoegen lukte niet: " + e.message, "fout"); });
    }

    /* De bestellijst per leverancier, om uit te printen of door te sturen. */
    function bestellijst() {
      var nodig = st.items.filter(function (v) {
        var s = stand(v).sleutel;
        return s === "bestellen" || s === "op" || v.besteld;
      });
      if (!nodig.length) { melden("Er staat niets op de bestellijst.", "ok"); return; }
      var per = {};
      nodig.forEach(function (v) {
        var l = String(v.leverancier || "Zonder leverancier").trim() || "Zonder leverancier";
        (per[l] = per[l] || []).push(v);
      });
      var h = "<h2>Bestellijst Bed &amp; Wellness Flevoland</h2><p>" +
        new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) + "</p>";
      Object.keys(per).sort().forEach(function (l) {
        h += "<h3>" + esc(l) + "</h3><table border='1' cellpadding='6' cellspacing='0'>" +
          "<tr><th align='left'>Artikel</th><th>Nu</th><th>Minimum</th><th>Bestellen</th><th>Status</th></tr>";
        per[l].sort(function (a, b) { return String(a.naam).localeCompare(String(b.naam)); })
          .forEach(function (v) {
            h += "<tr><td>" + esc(v.naam) + "</td><td align='center'>" + getal(v.aantal) +
              "</td><td align='center'>" + getal(v.min_aantal) +
              "</td><td align='center'>" + teBestellen(v) +
              "</td><td>" + esc(stand(v).tekst) + "</td></tr>";
          });
        h += "</table>";
      });
      var w = window.open("", "_blank");
      if (!w) { melden("Sta pop-ups toe om de bestellijst te openen.", "fout"); return; }
      w.document.write("<!doctype html><meta charset='utf-8'><title>Bestellijst</title>" +
        "<style>body{font-family:system-ui,sans-serif;margin:24px;font-size:14px}" +
        "h3{margin:18px 0 6px}table{border-collapse:collapse;margin-bottom:8px}" +
        "th,td{border:1px solid #ccc}</style>" + h);
      w.document.close();
    }

    haal();
    return { ververs: haal, items: function () { return st.items.slice(); } };
  }

  window.BWFVoorraad = { maak: maak, teBestellen: teBestellen, stand: stand };

  /* Zichzelf aanhaken. Een scherm hoeft alleen een element neer te zetten:

         <div data-bwf-voorraad></div>          de hele lijst
         <div data-bwf-voorraad="compact"></div> alleen wat bijgevuld moet worden

     Dat is bewust zo, omdat de schermen hun eigen scripts vaak vóór dit
     bestand laden: een aanroep in zo'n blok draait dan voordat BWFVoorraad
     bestaat, en je houdt een leeg vak over. Zo gemeten in dashboard.html,
     waar het grote scriptblok op regel 2749 staat en dit bestand pas op 2998.
     Angela, 21-09-2026. */
  function haakAan() {
    var vakken = document.querySelectorAll("[data-bwf-voorraad]");
    for (var i = 0; i < vakken.length; i++) {
      if (vakken[i].dataset.bwfGemaakt) continue;
      vakken[i].dataset.bwfGemaakt = "1";
      vakken[i].__bwfv = maak(vakken[i], {
        compact: vakken[i].getAttribute("data-bwf-voorraad") === "compact"
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", haakAan);
  else haakAan();
  window.BWFVoorraad.haakAan = haakAan;
})();
