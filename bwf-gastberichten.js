/* ============================================================
   BWF — Gastberichten van Booking.com, als overzicht
   ------------------------------------------------------------
   Angela, 13-10-2026: "kunnen de berichten en verzoeken ook in het
   dashboard weergegeven worden" - en daarna "graag dit nu bouwen".

   Opnemen is genoeg; het vak haakt zichzelf aan:

       <div data-bwf-gastberichten></div>
       <script src="bwf-gastberichten.js?v=1"></script>

   De berichten komen uit de tabel gast_berichten. Die wordt gevuld door een
   Google Apps Script dat de mails van Booking.com (afzender
   ...@guest.booking.com) naar de Edge Function gastberichten-mail stuurt.
   Wat je ziet bepaalt de database: een locatiemanager ziet alleen de
   berichten van zijn eigen suites.

   Hier staan ook de berichten die (nog) niet aan een reservering gekoppeld
   konden worden. Op de reserveringskaarten in de agenda staan alleen de
   gekoppelde.

   Antwoorden gaat via Booking.com: de knop "Beantwoorden" opent het gesprek
   in de Extranet. Daarna vink je het bericht hier af.

   Zet de pagina een element met id "badge-groep-gastberichten" of
   "badge-gastberichten" neer, dan komt daar het aantal open berichten in.
   ============================================================ */
(function () {
  "use strict";

  var PROJECT = "iuyjvtlauktnjprbmbjj";
  var BASIS = "https://" + PROJECT + ".supabase.co";
  var ANON = "sb_publishable_SfQjQTwKa3BgCtjwE-8ljw_mTpqEY3U";
  var SESSIE_SLEUTEL = "sb-" + PROJECT + "-auth-token";
  var TZ = "Europe/Amsterdam";
  var SUITES = { angie: "Suite Angie", malina_jacuzzi: "Malina Jacuzzi", malina_deluxe: "Malina Deluxe" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function wanneer(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleString("nl-NL", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  function dag(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("nl-NL", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
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
      /* vr2.html bewaart de sessie ook onder wz_sessie (zelfde als bwf-chats.js) */
      try {
        var w = JSON.parse(localStorage.getItem("wz_sessie") || "null");
        if (w && w.token) return Promise.resolve(w.token);
      } catch (e2) {}
      return Promise.resolve(null);
    }
    if (((jwtDeel(s.access_token).exp || 0) * 1000) - Date.now() > 60000) return Promise.resolve(s.access_token);
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

  function vraag(pad, opties) {
    return token().then(function (t) {
      if (!t) throw new Error("Log eerst in om de gastberichten te zien.");
      opties = opties || {};
      return fetch(BASIS + "/rest/v1/" + pad, {
        method: opties.method || "GET",
        headers: { apikey: ANON, Authorization: "Bearer " + t, "Content-Type": "application/json" },
        body: opties.body ? JSON.stringify(opties.body) : undefined
      });
    }).then(function (r) {
      return r.text().then(function (tekst) {
        var d = null;
        try { d = tekst ? JSON.parse(tekst) : null; } catch (e) {}
        if (!r.ok) {
          /* De tabel bestaat nog niet: de koppeling is nog niet geïnstalleerd. */
          if (r.status === 404 || (d && /gast_berichten/.test(String(d.message || "")))) {
            throw new Error("De koppeling voor gastberichten is nog niet geïnstalleerd.");
          }
          throw new Error((d && d.message) || ("fout " + r.status));
        }
        return d;
      });
    });
  }

  var CSS = [
    ".bwfg{font-size:14px;display:grid;gap:12px}",
    ".bwfg *{box-sizing:border-box}",
    ".bwfg-balk{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
    ".bwfg-balk button{font:inherit;font-size:13px;padding:6px 12px;border-radius:999px;border:1px solid #e3dad0;",
      "background:#fff;color:inherit;cursor:pointer}",
    ".bwfg-balk button[aria-pressed=\"true\"]{background:#3B322B;border-color:#3B322B;color:#fff}",
    ".bwfg-balk small{margin-left:auto;opacity:.6;font-size:12px}",
    ".bwfg-lijst{display:grid;gap:10px}",
    ".bwfg-item{border:1px solid #e3dad0;border-left:4px solid #1F5AA6;border-radius:12px;background:#fff;",
      "padding:12px 14px;display:grid;gap:6px}",
    ".bwfg-item.af{border-left-color:#3F7A55;opacity:.75}",
    ".bwfg-item.los{border-left-color:#8F6420}",
    ".bwfg-kop{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}",
    ".bwfg-kop b{font-size:15px}",
    ".bwfg-kop span{font-size:12.5px;opacity:.7}",
    ".bwfg-kop em{margin-left:auto;font-style:normal;font-size:12px;opacity:.6}",
    ".bwfg-soort{display:inline-block;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;",
      "padding:1px 7px;border-radius:999px;background:#1F5AA6;color:#fff;font-weight:600}",
    ".bwfg-soort.los{background:#8F6420}",
    ".bwfg-tekst{white-space:pre-wrap;word-break:break-word;font-size:14.5px;line-height:1.45;",
      "background:#faf7f3;border-radius:9px;padding:8px 11px}",
    ".bwfg-voet{display:flex;flex-wrap:wrap;gap:6px;align-items:center}",
    ".bwfg-voet small{opacity:.6;font-size:12px;margin-right:auto}",
    ".bwfg-voet a,.bwfg-voet button{font:inherit;font-size:12.5px;padding:5px 12px;border-radius:999px;",
      "border:1px solid #1F5AA6;background:#fff;color:#1F5AA6;text-decoration:none;cursor:pointer}",
    ".bwfg-voet button.hoofd{background:#1F5AA6;color:#fff}",
    ".bwfg-voet button[disabled]{opacity:.5;cursor:wait}",
    ".bwfg-leeg{opacity:.65;padding:18px 4px;font-size:13.5px}",
    ".bwfg-fout{color:#8C382B;font-size:13px}"
  ].join("\n");

  function zetStijl() {
    if (document.getElementById("bwfg-stijl")) return;
    var s = document.createElement("style");
    s.id = "bwfg-stijl";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function zetTeller(n) {
    ["badge-groep-gastberichten", "badge-gastberichten"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.textContent = n;
      el.hidden = !n;
    });
  }

  function maak(el) {
    zetStijl();
    var st = { filter: "open", rijen: [], fout: "", bezig: false, opgehaald: null };
    el.classList.add("bwfg");

    function itemHtml(b) {
      var res = b.reserveringen;
      var naam = b.gast_naam || (res && [res.gast_voornaam, res.gast_achternaam].filter(Boolean).join(" ")) || "Gast";
      var suite = SUITES[(res && res.suite) || b.suite] || b.accommodatie || "";
      var aankomst = res ? dag(res.aankomst) : (b.aankomst_datum ? dag(b.aankomst_datum + "T12:00:00Z") : "");
      var los = !b.reservering_id;
      var af = b.status === "afgehandeld";
      return '<div class="bwfg-item' + (af ? " af" : "") + (los && !af ? " los" : "") + '">' +
        '<div class="bwfg-kop"><b>' + esc(naam) + "</b>" +
          "<span>" + esc([suite, aankomst ? "aankomst " + aankomst : "", b.kanaal_ref ? "Booking " + b.kanaal_ref : ""].filter(Boolean).join(" · ")) + "</span>" +
          "<em>" + esc(wanneer(b.ontvangen_op)) + "</em></div>" +
        "<div>" + '<span class="bwfg-soort">' + (b.soort === "verzoek" ? "verzoek" : "bericht") + "</span> " +
          (los ? '<span class="bwfg-soort los">niet gekoppeld aan een reservering</span>' : "") + "</div>" +
        '<div class="bwfg-tekst">' + esc(b.bericht) + "</div>" +
        '<div class="bwfg-voet"><small>' +
          esc(af ? "afgehandeld" + (b.afgehandeld_door ? " door " + b.afgehandeld_door : "") +
                   (b.afgehandeld_op ? " · " + wanneer(b.afgehandeld_op) : "") : "") + "</small>" +
          '<a href="' + esc(b.antwoord_link || "https://admin.booking.com/") + '" target="_blank" rel="noopener">Beantwoorden in Booking.com</a>' +
          (b.reservering_id ? '<a href="reserveringen.html?id=' + encodeURIComponent(b.reservering_id) + '" target="_top">Reservering</a>' : "") +
          (af
            ? '<button type="button" data-gbweer="' + esc(b.id) + '">Weer open zetten</button>'
            : '<button type="button" class="hoofd" data-gbaf="' + esc(b.id) + '">Afgehandeld</button>') +
        "</div></div>";
    }

    function teken() {
      var open = st.filter === "open";
      el.innerHTML =
        '<div class="bwfg-balk">' +
          '<button type="button" data-gbfilter="open" aria-pressed="' + open + '">Open</button>' +
          '<button type="button" data-gbfilter="af" aria-pressed="' + !open + '">Afgehandeld</button>' +
          '<button type="button" data-gbververs>Verversen</button>' +
          "<small>" + (st.opgehaald ? "bijgewerkt " + esc(st.opgehaald) : (st.bezig ? "laden…" : "")) + "</small>" +
        "</div>" +
        (st.fout ? '<div class="bwfg-fout">' + esc(st.fout) + "</div>" : "") +
        '<div class="bwfg-lijst">' +
          (st.rijen.length
            ? st.rijen.map(itemHtml).join("")
            : (st.fout ? "" : '<div class="bwfg-leeg">' + (open ? "Geen open gastberichten. Alles is beantwoord." : "Nog niets afgehandeld.") + "</div>")) +
        "</div>";
    }

    function haal() {
      st.bezig = true;
      var open = st.filter === "open";
      var pad = "gast_berichten?select=*,reserveringen(suite,aankomst,gast_voornaam,gast_achternaam)" +
        "&status=eq." + (open ? "open" : "afgehandeld") +
        "&order=ontvangen_op." + (open ? "asc" : "desc") + "&limit=" + (open ? 200 : 50);
      return vraag(pad).then(function (rijen) {
        st.rijen = rijen || [];
        st.fout = "";
        st.opgehaald = new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
        if (open) zetTeller(st.rijen.length);
      }).catch(function (e) {
        st.fout = e.message;
      }).then(function () { st.bezig = false; teken(); });
    }

    function afvinken(knop, af) {
      knop.disabled = true;
      var id = Number(knop.getAttribute(af ? "data-gbaf" : "data-gbweer"));
      return vraag("rpc/gastbericht_afvinken", { method: "POST", body: { p_id: id, p_afgehandeld: af } })
        .then(function () {
          try { window.dispatchEvent(new CustomEvent("bwf:gastberichten", { detail: { bron: "overzicht" } })); } catch (e) {}
          return haal();
        })
        .then(function () { if (!af || st.filter === "af") telOpen(); })
        .catch(function (e) { st.fout = e.message; knop.disabled = false; teken(); });
    }

    /* Het aantal open berichten, ook als je naar "Afgehandeld" kijkt. */
    function telOpen() {
      return vraag("gast_berichten?select=id&status=eq.open&limit=500")
        .then(function (r) { zetTeller((r || []).length); })
        .catch(function () {});
    }

    el.addEventListener("click", function (e) {
      var t;
      if ((t = e.target.closest("[data-gbaf]"))) { afvinken(t, true); return; }
      if ((t = e.target.closest("[data-gbweer]"))) { afvinken(t, false); return; }
      if ((t = e.target.closest("[data-gbfilter]"))) { st.filter = t.getAttribute("data-gbfilter"); st.rijen = []; teken(); haal(); return; }
      if (e.target.closest("[data-gbververs]")) { haal(); }
    });
    /* Afgevinkt op een reserveringskaart in de agenda: bijwerken. */
    window.addEventListener("bwf:gastberichten", function (e) {
      if (e && e.detail && e.detail.bron === "overzicht") return;
      haal();
    });
    window.addEventListener("bwf:session", function () { haal(); });

    teken();
    haal();
    /* Elke 2 minuten opnieuw: een inchecktijd-vraag moet je snel zien. */
    setInterval(function () { if (!document.hidden) haal(); }, 2 * 60 * 1000);
    return { ververs: haal };
  }

  window.BWFGastberichten = { maak: maak };

  function haakAan() {
    var vakken = document.querySelectorAll("[data-bwf-gastberichten]");
    for (var i = 0; i < vakken.length; i++) {
      if (vakken[i].dataset.bwfGemaakt) continue;
      vakken[i].dataset.bwfGemaakt = "1";
      vakken[i].__bwfg = maak(vakken[i]);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", haakAan);
  else haakAan();
  window.BWFGastberichten.haakAan = haakAan;
})();
