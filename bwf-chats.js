/* ============================================================
   BWF — WhatsApp-gesprekken uit Wati, in het dashboard
   ------------------------------------------------------------
   Angela, 21-09-2026: "ik wil via het dashboard ook alle chats kunnen openen
   van Wati."

   Opnemen is genoeg; het vak haakt zichzelf aan:

       <div data-bwf-chats></div>
       <script src="bwf-chats.js?v=1"></script>

   De gesprekken komen NIET rechtstreeks uit Wati maar via de Edge Function
   wati-chats. Dat moet ook: het Wati-token mag niet in een pagina staan die
   iedereen kan lezen, en Wati staat geen aanroepen vanuit een browser toe.
   Die functie kijkt zelf of je bent ingelogd en welke rol je hebt.

   Er wordt hier alleen gelezen. Terugsturen kan wel technisch, maar WhatsApp
   laat een bedrijf alleen een vrij bericht sturen binnen 24 uur nadat de gast
   zelf iets stuurde; daarbuiten moet het via een goedgekeurd sjabloon. Dat is
   een apart onderwerp en staat bewust niet in deze eerste versie.
   ============================================================ */
(function () {
  "use strict";

  var PROJECT = "iuyjvtlauktnjprbmbjj";
  var BASIS = "https://" + PROJECT + ".supabase.co";
  var ANON = "sb_publishable_SfQjQTwKa3BgCtjwE-8ljw_mTpqEY3U";
  var SESSIE_SLEUTEL = "sb-" + PROJECT + "-auth-token";
  var FUNCTIE = BASIS + "/functions/v1/wati-chats";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* 31612345678 -> 06 12345678, zodat het te herkennen is naast een
     telefoonnummer uit een reservering. */
  function nlNummer(n) {
    var s = String(n || "").replace(/\D/g, "");
    if (s.indexOf("31") === 0 && s.length === 11) return "0" + s.slice(2, 3) + " " + s.slice(3);
    return s;
  }

  function wanneer(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    var nu = new Date();
    var zelfdeDag = d.toDateString() === nu.toDateString();
    var gisteren = new Date(nu.getTime() - 86400000).toDateString() === d.toDateString();
    var klok = d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
    if (zelfdeDag) return klok;
    if (gisteren) return "gisteren " + klok;
    return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" }) + " " + klok;
  }

  var verversBezig = null;
  function jwtDeel(t) {
    try { return JSON.parse(atob(String(t).split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); }
    catch (e) { return {}; }
  }
  function token() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(SESSIE_SLEUTEL) || "null"); } catch (e) {}
    if (!s || !s.access_token) {
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

  function vraag(body) {
    return token().then(function (t) {
      if (!t) throw new Error("Log eerst in om de gesprekken te zien.");
      return fetch(FUNCTIE, {
        method: "POST",
        headers: { apikey: ANON, Authorization: "Bearer " + t, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    }).then(function (r) {
      return r.text().then(function (tekst) {
        var d = null;
        try { d = tekst ? JSON.parse(tekst) : null; } catch (e) {}
        if (!r.ok) throw new Error((d && d.fout) || ("fout " + r.status));
        return d || {};
      });
    });
  }

  var CSS = [
    ".bwfc{--c-lijn:#e3dad0;--c-vlak:#fff;--c-zacht:#faf7f3;font-size:14px;display:grid;",
      "grid-template-columns:minmax(220px,300px) 1fr;gap:14px;align-items:start}",
    ".bwfc *{box-sizing:border-box}",
    ".bwfc-lijst{border:1px solid var(--c-lijn);border-radius:12px;background:var(--c-vlak);overflow:hidden}",
    ".bwfc-zoek{padding:10px;border-bottom:1px solid var(--c-lijn)}",
    ".bwfc-zoek input{width:100%;font:inherit;font-size:14px;padding:8px 10px;border:1px solid var(--c-lijn);",
      "border-radius:9px;background:var(--c-zacht);color:inherit}",
    ".bwfc-rollen{max-height:min(62vh,620px);overflow-y:auto}",
    ".bwfc-gesprek{display:block;width:100%;text-align:left;font:inherit;background:none;border:0;",
      "border-bottom:1px solid var(--c-lijn);padding:10px 12px;cursor:pointer}",
    ".bwfc-gesprek:hover{background:var(--c-zacht)}",
    ".bwfc-gesprek[aria-current=\"true\"]{background:#3B322B;color:#fff}",
    ".bwfc-gesprek b{display:block;font-size:14px;font-weight:600}",
    ".bwfc-gesprek span{display:block;font-size:12px;opacity:.7;margin-top:1px}",
    ".bwfc-gesprek em{float:right;font-style:normal;font-size:11.5px;opacity:.65}",
    ".bwfc-venster{border:1px solid var(--c-lijn);border-radius:12px;background:var(--c-zacht);",
      "min-height:280px;display:flex;flex-direction:column}",
    ".bwfc-kop{padding:11px 14px;border-bottom:1px solid var(--c-lijn);background:var(--c-vlak);",
      "border-radius:12px 12px 0 0;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}",
    ".bwfc-kop b{font-size:15px}",
    ".bwfc-kop small{opacity:.65;font-size:12.5px}",
    ".bwfc-kop a{margin-left:auto;font-size:12.5px}",
    ".bwfc-berichten{padding:14px;overflow-y:auto;max-height:min(58vh,560px);display:flex;",
      "flex-direction:column;gap:7px}",
    ".bwfc-bericht{max-width:78%;padding:8px 11px;border-radius:13px;line-height:1.4;",
      "white-space:pre-wrap;word-break:break-word;background:var(--c-vlak);border:1px solid var(--c-lijn)}",
    ".bwfc-bericht.wij{align-self:flex-end;background:#dcf8c6;border-color:#cbeeb4}",
    ".bwfc-bericht time{display:block;font-size:11px;opacity:.55;margin-top:3px}",
    ".bwfc-leeg{opacity:.6;padding:22px 16px;font-size:13.5px}",
    ".bwfc-fout{color:#B3261E;padding:14px;font-size:13.5px}",
    ".bwfc-terug{display:none}",
    "@media(max-width:700px){",
      ".bwfc{grid-template-columns:1fr}",
      ".bwfc.open .bwfc-lijst{display:none}",
      ".bwfc:not(.open) .bwfc-venster{display:none}",
      ".bwfc-terug{display:inline-block;font:inherit;font-size:13px;background:none;border:0;",
        "cursor:pointer;padding:0;text-decoration:underline}}",
    "@media print{.bwfc-lijst,.bwfc-zoek{display:none}}"
  ].join("");

  var cssGezet = false;
  function zetCss() {
    if (cssGezet) return;
    cssGezet = true;
    var s = document.createElement("style");
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function maak(el) {
    if (!el) return null;
    zetCss();
    el.classList.add("bwfc");

    var st = { gesprekken: [], gekozen: null, berichten: [], zoek: "", bezig: false, fout: "" };

    function tekenLijst() {
      var vak = el.querySelector(".bwfc-rollen");
      if (!vak) return;
      if (!st.gesprekken.length) {
        vak.innerHTML = '<p class="bwfc-leeg">' +
          (st.bezig ? "Bezig met ophalen…" : "Geen gesprekken gevonden.") + "</p>";
        return;
      }
      vak.innerHTML = st.gesprekken.map(function (g) {
        return '<button class="bwfc-gesprek" type="button" data-nummer="' + esc(g.nummer) + '"' +
          (st.gekozen === g.nummer ? ' aria-current="true"' : "") + ">" +
          '<em>' + esc(wanneer(g.laatste)) + "</em>" +
          "<b>" + esc(g.naam || nlNummer(g.nummer)) + "</b>" +
          "<span>" + esc(nlNummer(g.nummer)) +
          (g.ongelezen ? " &middot; " + g.ongelezen + " ongelezen" : "") + "</span></button>";
      }).join("");
    }

    function tekenVenster() {
      var vak = el.querySelector(".bwfc-venster");
      if (!vak) return;
      if (!st.gekozen) {
        vak.innerHTML = '<p class="bwfc-leeg">Kies links een gesprek om het te lezen.</p>';
        return;
      }
      var g = st.gesprekken.filter(function (x) { return x.nummer === st.gekozen; })[0] || {};
      var kop = '<div class="bwfc-kop">' +
        '<button class="bwfc-terug" type="button" data-terug>&larr; gesprekken</button>' +
        "<b>" + esc(g.naam || nlNummer(st.gekozen)) + "</b>" +
        "<small>" + esc(nlNummer(st.gekozen)) + "</small>" +
        '<a href="https://wa.me/' + esc(st.gekozen) + '" target="_blank" rel="noopener">In WhatsApp openen</a>' +
        "</div>";
      if (st.fout) { vak.innerHTML = kop + '<p class="bwfc-fout">' + esc(st.fout) + "</p>"; return; }
      if (st.bezig) { vak.innerHTML = kop + '<p class="bwfc-leeg">Bezig met ophalen…</p>'; return; }
      if (!st.berichten.length) {
        vak.innerHTML = kop + '<p class="bwfc-leeg">Nog geen berichten in dit gesprek.</p>';
        return;
      }
      vak.innerHTML = kop + '<div class="bwfc-berichten">' + st.berichten.map(function (b) {
        var tekst = b.tekst || (b.soort && b.soort !== "text" ? "[" + b.soort + "]" : "");
        return '<div class="bwfc-bericht' + (b.vanOns ? " wij" : "") + '">' +
          esc(tekst) + "<time>" + esc(wanneer(b.tijd)) + "</time></div>";
      }).join("") + "</div>";
      var lijst = vak.querySelector(".bwfc-berichten");
      if (lijst) lijst.scrollTop = lijst.scrollHeight;   /* onderaan beginnen, zoals WhatsApp */
    }

    function teken() {
      if (!el.querySelector(".bwfc-lijst")) {
        el.innerHTML =
          '<div class="bwfc-lijst"><div class="bwfc-zoek">' +
            '<input type="search" placeholder="Zoek op naam" data-zoek></div>' +
            '<div class="bwfc-rollen"></div></div>' +
          '<div class="bwfc-venster"></div>';
      }
      tekenLijst();
      tekenVenster();
    }

    function haalGesprekken() {
      st.bezig = true; teken();
      return vraag({ wat: "gesprekken", zoek: st.zoek })
        .then(function (d) {
          st.gesprekken = d.gesprekken || [];
          st.bezig = false; teken();
        })
        .catch(function (e) {
          st.bezig = false;
          st.gesprekken = [];
          var vak = el.querySelector(".bwfc-rollen");
          if (vak) vak.innerHTML = '<p class="bwfc-fout">' + esc(e.message) + "</p>";
        });
    }

    function haalBerichten(nummer) {
      st.gekozen = nummer;
      st.berichten = [];
      st.fout = "";
      st.bezig = true;
      el.classList.add("open");
      teken();
      return vraag({ wat: "berichten", nummer: nummer })
        .then(function (d) { st.berichten = d.berichten || []; st.bezig = false; teken(); })
        .catch(function (e) { st.fout = e.message; st.bezig = false; teken(); });
    }

    el.addEventListener("click", function (e) {
      var g = e.target.closest("[data-nummer]");
      if (g && el.contains(g)) { haalBerichten(g.getAttribute("data-nummer")); return; }
      if (e.target.closest("[data-terug]")) { el.classList.remove("open"); return; }
    });

    var wacht = null;
    el.addEventListener("input", function (e) {
      if (e.target.dataset.zoek === undefined) return;
      var waarde = e.target.value;
      clearTimeout(wacht);
      wacht = setTimeout(function () {
        st.zoek = waarde;
        haalGesprekken().then(function () {
          var z = el.querySelector("[data-zoek]");
          if (z) { z.value = waarde; z.focus(); z.setSelectionRange(waarde.length, waarde.length); }
        });
      }, 400);
    });

    teken();
    haalGesprekken();
    return { ververs: haalGesprekken, open: haalBerichten };
  }

  window.BWFChats = { maak: maak };

  function haakAan() {
    var vakken = document.querySelectorAll("[data-bwf-chats]");
    for (var i = 0; i < vakken.length; i++) {
      if (vakken[i].dataset.bwfGemaakt) continue;
      vakken[i].dataset.bwfGemaakt = "1";
      vakken[i].__bwfc = maak(vakken[i]);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", haakAan);
  else haakAan();
  window.BWFChats.haakAan = haakAan;
})();
