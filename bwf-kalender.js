/* =====================================================================
   BWF — kalender (dag · week · maand · jaar)
   Zet ergens op de pagina <div id="bwfKalender"></div> en laad daarna
   dit bestand met <script src="bwf-kalender.js"></script>.
   Werkt op telefoon, tablet en desktop; past zich vanzelf aan.
   ===================================================================== */
(function () {
  "use strict";
  var DOEL = document.getElementById("bwfKalender");
  if (!DOEL) return;

  var SB_URL = "https://iuyjvtlauktnjprbmbjj.supabase.co";
  var SB_KEY = "sb_publishable_SfQjQTwKa3BgCtjwE-8ljw_mTpqEY3U";
  var AGENDA_PROXY = "https://script.google.com/macros/s/AKfycbwyOhWt48rEQP6sfGvT6NokYWmmuVTziy064gPez9rRXTPEvmJcAb_qPk6m0i4UCY1f4A/exec";
  var AGENDA_KEY = "bwf7k2mxq9tvr20264nphs8wjc3";

  var SUITES = ["Malina Jacuzzi", "Malina Zwembad", "Suite Angie Almere"];
  var KLEUR = { "Malina Jacuzzi": "#1C6FD0", "Malina Zwembad": "#D63A2A", "Suite Angie Almere": "#0F7B5A" };
  var PALET = ["#1C6FD0", "#D63A2A", "#0F7B5A", "#8A5BC4", "#A3742A", "#83334c", "#2da2bb"];
  var MAANDEN = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
  var DAGEN = ["ma","di","wo","do","vr","za","zo"];

  var RES = [], DIENSTEN = [], TEAM = [], KLEURVAN = {};
  var weergave = "maand", dag = "", maand = "", zoek = "", suite = "";

  /* ---------- hulpjes ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function vandaag() { return iso(new Date()); }
  function dmy(d) {
    var p = String(d || "").slice(0, 10).split("-");
    return p.length === 3 ? Number(p[2]) + "-" + Number(p[1]) + "-" + p[0] : String(d || "");
  }
  function tijd(v) {
    var s = String(v || "");
    var t = s.length > 10 ? s.slice(11, 16) : (/^\d{1,2}:\d{2}/.test(s) ? s.slice(0, 5) : "");
    return t && t !== "00:00" ? t : "";
  }
  function suiteNaam(v) {
    var t = String(v || "").toLowerCase().replace(/[^a-z]/g, "");
    if (/psmd|psd|deluxe|zwembad/.test(t)) return "Malina Zwembad";
    if (/psm|jacuzzi|malina/.test(t)) return "Malina Jacuzzi";
    if (/psa|angie|almere/.test(t)) return "Suite Angie Almere";
    return "";
  }
  function kort(s) {
    return s === "Malina Zwembad" ? "Zwembad" : s === "Malina Jacuzzi" ? "Jacuzzi" : s === "Suite Angie Almere" ? "Angie" : s;
  }
  function overnachting(r) {
    var a = String(r.start || "").slice(0, 10), b = String(r.eind || "").slice(0, 10);
    return !!(b && b !== a);
  }
  function dienstLabel(d) {
    return d === "nacht" ? "Nachtverblijf" : d === "schoonmaak" ? "Schoonmaak"
      : d === "afwezig" ? "Niet beschikbaar" : "Dagverblijf";
  }
  function teamNaam(id) {
    for (var i = 0; i < TEAM.length; i++) if (String(TEAM[i].id) === String(id)) return TEAM[i].naam || "";
    return "Onbekend";
  }
  function haal(pad) {
    return fetch(SB_URL + "/rest/v1/" + pad, { headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; });
  }

  /* ---------- opmaak ---------- */
  var css = document.createElement("style");
  css.textContent = [
    "#bwfKalender{--k-line:var(--line,#dfe6ef);--k-zacht:var(--line-soft,#edf1f6);",
    "  --k-vlak:var(--surface,#fff);--k-vlak2:var(--surface-2,#f8fafd);--k-accent:var(--accent,#165dff);",
    "  --k-muted:var(--muted,#738097);font-family:inherit;color:inherit;display:block}",
    "#bwfKalender .kbalk{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}",
    "#bwfKalender .ktitel{font-weight:700;font-size:18px;text-transform:capitalize;margin-right:auto}",
    "#bwfKalender .kpijl{border:1px solid var(--k-line);background:var(--k-vlak);border-radius:10px;",
    "  width:36px;height:36px;cursor:pointer;font-size:16px;line-height:1}",
    "#bwfKalender .kseg{display:inline-flex;border:1px solid var(--k-line);border-radius:999px;overflow:hidden;background:var(--k-vlak)}",
    "#bwfKalender .kseg button{border:0;background:none;padding:8px 14px;font:inherit;font-size:13.5px;cursor:pointer;color:var(--k-muted)}",
    "#bwfKalender .kseg button[aria-pressed=\"true\"]{background:var(--k-accent);color:#fff;font-weight:600}",
    "#bwfKalender .kfilter{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}",
    "#bwfKalender select,#bwfKalender input[type=search]{border:1px solid var(--k-line);border-radius:10px;",
    "  padding:9px 11px;font:inherit;font-size:14px;background:var(--k-vlak2);color:inherit;min-height:40px}",
    "#bwfKalender input[type=search]{flex:1;min-width:170px}",
    "#bwfKalender .knu{border:1px solid var(--k-line);background:var(--k-vlak);border-radius:10px;padding:8px 14px;font:inherit;font-size:13.5px;cursor:pointer}",
    "#bwfKalender .krooster{border:1px solid var(--k-line);border-radius:16px;overflow:hidden;background:var(--k-vlak)}",
    "#bwfKalender .kkoppen{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));background:var(--k-vlak2);border-bottom:1px solid var(--k-line)}",
    "#bwfKalender .kkoppen div{padding:9px 6px;text-align:center;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--k-muted)}",
    "#bwfKalender .knet{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}",
    "#bwfKalender .kcel{min-height:118px;min-width:0;padding:7px 7px 10px;border-right:1px solid var(--k-zacht);",
    "  border-bottom:1px solid var(--k-zacht);background:none;text-align:left;font:inherit;color:inherit;cursor:pointer}",
    "#bwfKalender .kcel:nth-child(7n){border-right:0}",
    "#bwfKalender .kcel[data-buiten=\"1\"]{opacity:.4}",
    "#bwfKalender .kcel[data-vandaag=\"1\"]{box-shadow:inset 0 0 0 2px var(--k-accent);border-radius:10px}",
    "#bwfKalender .kcel[data-gekozen=\"1\"]{background:var(--accent-soft,#eaf1ff)}",
    "#bwfKalender .knr{display:inline-block;min-width:22px;font-size:12.5px;font-weight:700;color:var(--k-muted);margin-bottom:5px}",
    "#bwfKalender .kdagnaam{display:none;font-size:12px;font-weight:700;text-transform:uppercase;color:var(--k-muted);margin-bottom:5px}",
    "#bwfKalender .kev{display:block;width:100%;border:0;border-radius:7px;padding:5px 8px;margin-bottom:4px;",
    "  font-size:12.5px;font-weight:600;line-height:1.3;color:#fff;text-align:left;",
    "  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    "#bwfKalender .kev .t{font-variant-numeric:tabular-nums;margin-right:5px}",
    "#bwfKalender .kdienst{display:inline-block;font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:999px;",
    "  color:#fff;margin:0 4px 5px 0;white-space:nowrap}",
    "#bwfKalender .kdienst.afw{text-decoration:line-through;opacity:.8}",
    "#bwfKalender .kjaar{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:14px}",
    "#bwfKalender .kmaand{border:1px solid var(--k-line);border-radius:12px;padding:14px;background:var(--k-vlak2);",
    "  cursor:pointer;text-align:left;font:inherit;color:inherit;display:flex;flex-direction:column;gap:5px}",
    "#bwfKalender .kmaand:hover{border-color:var(--k-accent)}",
    "#bwfKalender .kmaand strong{font-size:14.5px;text-transform:capitalize}",
    "#bwfKalender .kmaand span{font-size:12.5px;color:var(--k-muted)}",
    "#bwfKalender .kbalkje{display:flex;gap:3px;margin-top:4px}",
    "#bwfKalender .kbalkje i{height:6px;border-radius:3px;display:block}",
    "#bwfKalender .kdaglijst{padding:14px}",
    "#bwfKalender .kdaglijst h3{margin:14px 0 8px;font-size:14px}",
    "#bwfKalender .kdaglijst h3:first-child{margin-top:0}",
    "#bwfKalender .kvoet{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:12px;font-size:12.5px;color:var(--k-muted)}",
    "#bwfKalender .kleg{display:inline-flex;align-items:center;gap:6px}",
    "#bwfKalender .kdot{width:9px;height:9px;border-radius:50%;display:inline-block}",
    "#bwfKalender .kleeg{padding:26px 14px;text-align:center;color:var(--k-muted);font-size:13.5px}",
    /* tablet */
    "@media(max-width:900px){#bwfKalender .kcel{min-height:104px}#bwfKalender .kjaar{grid-template-columns:repeat(3,minmax(0,1fr))}}",
    /* telefoon: dagen onder elkaar, lege dagen weg */
    "@media(max-width:640px){",
    "  #bwfKalender .ktitel{width:100%;font-size:17px;margin-right:0}",
    "  #bwfKalender .kseg button{padding:8px 11px;font-size:13px}",
    "  #bwfKalender .kkoppen{display:none}",
    "  #bwfKalender .knet{grid-template-columns:1fr}",
    "  #bwfKalender .kcel{min-height:0;border-right:0;padding:10px 12px}",
    "  #bwfKalender .kcel[data-leeg=\"1\"]{display:none}",
    "  #bwfKalender .knr{display:none}",
    "  #bwfKalender .kdagnaam{display:block}",
    "  #bwfKalender .kjaar{grid-template-columns:repeat(2,minmax(0,1fr))}",
    "}"
  ].join("\n");
  document.head.appendChild(css);

  DOEL.innerHTML =
    '<div class="kbalk">' +
      '<button class="kpijl" type="button" data-k="vorige" aria-label="Vorige">&lsaquo;</button>' +
      '<span class="ktitel" id="kTitel">&nbsp;</span>' +
      '<button class="knu" type="button" data-k="nu">Vandaag</button>' +
      '<button class="kpijl" type="button" data-k="volgende" aria-label="Volgende">&rsaquo;</button>' +
      '<span class="kseg" id="kSeg" role="group" aria-label="Weergave">' +
        '<button type="button" data-v="dag" aria-pressed="false">Dag</button>' +
        '<button type="button" data-v="week" aria-pressed="false">Week</button>' +
        '<button type="button" data-v="maand" aria-pressed="true">Maand</button>' +
        '<button type="button" data-v="jaar" aria-pressed="false">Jaar</button>' +
      '</span>' +
    '</div>' +
    '<div class="kfilter">' +
      '<select id="kSuite"><option value="">Alle suites</option>' +
        SUITES.map(function (s) { return '<option>' + esc(s) + "</option>"; }).join("") +
      "</select>" +
      '<input type="search" id="kZoek" placeholder="Zoek op naam, nummer of platform">' +
    "</div>" +
    '<div class="krooster" id="kRooster"><div class="kleeg">Bezig met laden…</div></div>' +
    '<div class="kvoet" id="kVoet"></div>';

  /* ---------- gegevens ---------- */
  function laden() {
    var vd = vandaag();
    var taken = [
      fetch(AGENDA_PROXY + "?k=" + encodeURIComponent(AGENDA_KEY)).then(function (r) { return r.json(); }).catch(function () { return {}; }),
      haal("reservations?select=*&order=checkindatum.desc&limit=3000"),
      haal("planning?select=*&order=datum.asc&limit=4000"),
      haal("medewerkers?select=*")
    ];
    return Promise.all(taken).then(function (uit) {
      RES = [];
      ((uit[0] && uit[0].events) || []).forEach(function (ev) {
        if (ev.soort !== "reservering" && ev.soort !== "extern") return;
        RES.push({
          locatie: suiteNaam(ev.suite || ev.locatie),
          naam: ev.gast || ev.naam || ev.titel || "",
          start: ev.start, eind: ev.eind,
          ref: ev.nummer || ev.referentie || "",
          bron: ev.bron || (ev.soort === "extern" ? "extern" : "agenda")
        });
      });
      (uit[1] || []).forEach(function (r) {
        var s = String(r.checkindatum || "").slice(0, 10);
        if (!s) return;
        RES.push({
          locatie: suiteNaam(r.locatie),
          naam: [r.voornaam, r.achternaam].filter(Boolean).join(" ") || r.naam || "",
          start: r.checkindatum, eind: r.checkuitdatum,
          ref: r.referentie || "", bron: r.bron || "eigen"
        });
      });
      DIENSTEN = uit[2] || [];
      TEAM = uit[3] || [];
      TEAM.forEach(function (m, i) { KLEURVAN[m.id] = PALET[i % PALET.length]; });
      maand = vd.slice(0, 7); dag = vd;
      teken();
    });
  }

  /* ---------- filteren ---------- */
  function lijst() {
    return RES.filter(function (r) {
      if (suite && r.locatie !== suite) return false;
      if (zoek) {
        var t = [r.naam, r.ref, r.locatie, r.bron, String(r.start || "").slice(0, 10),
          dmy(r.start)].filter(Boolean).join(" ").toLowerCase();
        if (t.indexOf(zoek) < 0) return false;
      }
      return true;
    });
  }
  function perDag(rijen) {
    var m = {};
    rijen.forEach(function (r) {
      var d = String(r.start || "").slice(0, 10);
      if (d) (m[d] = m[d] || []).push(r);
    });
    Object.keys(m).forEach(function (d) {
      m[d].sort(function (a, b) { return String(tijd(a.start)).localeCompare(String(tijd(b.start))); });
    });
    return m;
  }
  function dienstenPerDag() {
    var m = {};
    DIENSTEN.forEach(function (p) {
      var d = String(p.datum || "").slice(0, 10);
      if (d) (m[d] = m[d] || []).push(p);
    });
    return m;
  }

  /* ---------- bouwstenen ---------- */
  function evHtml(r) {
    var t = tijd(r.start);
    return '<span class="kev" style="background:' + (KLEUR[r.locatie] || "#9A7B4F") + '" title="' +
      esc((r.locatie || "onbekend") + " · " + (r.naam || "gast") + (r.bron ? " · " + r.bron : "")) + '">' +
      esc(kort(r.locatie) || "?") + " " + (t ? '<span class="t">' + esc(t) + "</span>" : "") +
      esc((overnachting(r) ? "Overnachting" : "Dagverblijf") + " · " + (r.naam || "gast")) + "</span>";
  }
  function dienstHtml(p) {
    var afw = p.dienst === "afwezig";
    var naam = String(teamNaam(p.medewerker_id) || "").split(" ")[0];
    return '<span class="kdienst' + (afw ? " afw" : "") + '" style="background:' +
      (afw ? "#B9AFA4" : (KLEURVAN[p.medewerker_id] || "#9A7B4F")) + '" title="' +
      esc(teamNaam(p.medewerker_id) + " · " + dienstLabel(p.dienst) + (p.notitie ? " · " + p.notitie : "")) + '">' +
      esc(naam) + (p.dienst === "nacht" ? " \u263d" : p.dienst === "schoonmaak" ? " \u2726" : "") + "</span>";
  }
  function cel(ds, res, dnst, buiten) {
    var r = res[ds] || [], d = dnst[ds] || [];
    var leeg = !r.length && !d.length;
    var datum = new Date(ds + "T12:00:00");
    return '<button type="button" class="kcel" data-dag="' + ds + '"' +
      ' data-buiten="' + (buiten ? 1 : 0) + '" data-leeg="' + (leeg ? 1 : 0) + '"' +
      ' data-vandaag="' + (ds === vandaag() ? 1 : 0) + '" data-gekozen="' + (ds === dag ? 1 : 0) + '">' +
      '<span class="knr">' + Number(ds.slice(8, 10)) + "</span>" +
      '<span class="kdagnaam">' + DAGEN[(datum.getDay() + 6) % 7] + " " + Number(ds.slice(8, 10)) +
        " " + MAANDEN[Number(ds.slice(5, 7)) - 1].slice(0, 3) + "</span>" +
      d.map(dienstHtml).join("") + r.map(evHtml).join("") + "</button>";
  }

  /* ---------- tekenen ---------- */
  function teken() {
    var rijen = lijst(), res = perDag(rijen), dnst = dienstenPerDag();
    var rooster = document.getElementById("kRooster");
    var kop = DAGEN.map(function (d) { return "<div>" + d + "</div>"; }).join("");
    var html = "", titel = "", aantal = 0;
    var vd = vandaag();

    if (weergave === "dag") {
      var d1 = dag || vd;
      var r1 = res[d1] || [], p1 = dnst[d1] || [];
      aantal = r1.length;
      html = '<div class="kdaglijst"><h3>Wie staat er ingepland</h3>' +
        (p1.length ? p1.map(dienstHtml).join("") : '<p class="kleeg" style="padding:0;text-align:left">Niemand ingepland.</p>') +
        SUITES.filter(function (s) { return !suite || s === suite; }).map(function (s) {
          var deel = r1.filter(function (x) { return x.locatie === s; });
          return "<h3>" + esc(s) + "</h3>" + (deel.length ? deel.map(evHtml).join("")
            : '<p class="kleeg" style="padding:0;text-align:left">Niets geboekt.</p>');
        }).join("") + "</div>";
      titel = dmy(d1);

    } else if (weergave === "week") {
      var b = new Date((dag || vd) + "T12:00:00");
      b.setDate(b.getDate() - ((b.getDay() + 6) % 7));
      html = '<div class="kkoppen">' + kop + '</div><div class="knet">';
      for (var w = 0; w < 7; w++) {
        var dw = new Date(b); dw.setDate(b.getDate() + w);
        var dsw = iso(dw);
        aantal += (res[dsw] || []).length;
        html += cel(dsw, res, dnst, false);
      }
      html += "</div>";
      var e = new Date(b); e.setDate(b.getDate() + 6);
      titel = dmy(iso(b)) + " t/m " + dmy(iso(e));

    } else if (weergave === "jaar") {
      var jaar = Number(maand.slice(0, 4));
      html = '<div class="kjaar">';
      for (var mm = 1; mm <= 12; mm++) {
        var sleutel = jaar + "-" + String(mm).padStart(2, "0");
        var inMaand = rijen.filter(function (r) { return String(r.start || "").slice(0, 7) === sleutel; });
        aantal += inMaand.length;
        var tot = inMaand.length || 1;
        html += '<button type="button" class="kmaand" data-maand="' + sleutel + '">' +
          "<strong>" + MAANDEN[mm - 1] + "</strong>" +
          "<span>" + inMaand.length + " reservering" + (inMaand.length === 1 ? "" : "en") + "</span>" +
          '<span class="kbalkje">' + SUITES.map(function (s) {
            var n = inMaand.filter(function (x) { return x.locatie === s; }).length;
            return n ? '<i style="background:' + KLEUR[s] + ";flex:" + (n / tot) + '"></i>' : "";
          }).join("") + "</span></button>";
      }
      html += "</div>";
      titel = String(jaar);

    } else {
      var j = Number(maand.slice(0, 4)), m = Number(maand.slice(5, 7)) - 1;
      var start = (new Date(j, m, 1).getDay() + 6) % 7;
      var dagen = new Date(j, m + 1, 0).getDate();
      html = '<div class="kkoppen">' + kop + '</div><div class="knet">';
      var eerste = new Date(j, m, 1 - start);
      for (var i = 0; i < 42; i++) {
        var d = new Date(eerste); d.setDate(eerste.getDate() + i);
        var ds = iso(d), buiten = d.getMonth() !== m;
        if (!buiten) aantal += (res[ds] || []).length;
        html += cel(ds, res, dnst, buiten);
        if (i >= 34 && new Date(j, m, 1 - start + i + 1).getMonth() !== m) break;
      }
      html += "</div>";
      titel = MAANDEN[m] + " " + j;
    }

    rooster.innerHTML = html;
    document.getElementById("kTitel").textContent = titel;
    document.getElementById("kVoet").innerHTML =
      "<span>" + aantal + " reservering" + (aantal === 1 ? "" : "en") + " in beeld</span>" +
      SUITES.map(function (s) {
        return '<span class="kleg"><span class="kdot" style="background:' + KLEUR[s] + '"></span>' + esc(s) + "</span>";
      }).join("") +
      '<span class="kleg">\u263d nacht \u00b7 \u2726 schoonmaak</span>';
  }

  /* ---------- bediening ---------- */
  function schuif(stap) {
    if (weergave === "dag" || weergave === "week") {
      var d = new Date((dag || vandaag()) + "T12:00:00");
      d.setDate(d.getDate() + stap * (weergave === "dag" ? 1 : 7));
      dag = iso(d); maand = dag.slice(0, 7);
    } else if (weergave === "jaar") {
      maand = (Number(maand.slice(0, 4)) + stap) + maand.slice(4);
    } else {
      var p = maand.split("-");
      var n = new Date(Number(p[0]), Number(p[1]) - 1 + stap, 1);
      maand = iso(n).slice(0, 7);
    }
    teken();
  }
  DOEL.addEventListener("click", function (e) {
    var k = e.target.closest("[data-k]");
    if (k) {
      if (k.getAttribute("data-k") === "vorige") schuif(-1);
      else if (k.getAttribute("data-k") === "volgende") schuif(1);
      else { dag = vandaag(); maand = dag.slice(0, 7); teken(); }
      return;
    }
    var v = e.target.closest("#kSeg [data-v]");
    if (v) {
      weergave = v.getAttribute("data-v");
      [].forEach.call(DOEL.querySelectorAll("#kSeg [data-v]"), function (b) {
        b.setAttribute("aria-pressed", String(b === v));
      });
      if (!dag) dag = vandaag();
      teken();
      return;
    }
    var mv = e.target.closest("[data-maand]");
    if (mv) {
      maand = mv.getAttribute("data-maand"); weergave = "maand";
      [].forEach.call(DOEL.querySelectorAll("#kSeg [data-v]"), function (b) {
        b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === "maand"));
      });
      teken();
      return;
    }
    var c = e.target.closest("[data-dag]");
    if (c) {
      var ds = c.getAttribute("data-dag");
      dag = (dag === ds && weergave === "maand") ? "" : ds;
      if (weergave === "maand") teken(); else { maand = ds.slice(0, 7); teken(); }
    }
  });
  DOEL.addEventListener("change", function (e) {
    if (e.target.id === "kSuite") { suite = e.target.value; teken(); }
  });
  DOEL.addEventListener("input", function (e) {
    if (e.target.id === "kZoek") { zoek = e.target.value.toLowerCase().trim(); teken(); }
  });

  laden();
  setInterval(function () { if (!document.hidden) laden(); }, 300000);
})();
