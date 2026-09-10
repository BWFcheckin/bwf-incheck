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

  var SUITES = ["Malina Jacuzzi", "Malina Zwembad", "Suite Angie Almere"];
  var KLEUR = { "Malina Jacuzzi": "#1C6FD0", "Malina Zwembad": "#D63A2A", "Suite Angie Almere": "#0F7B5A" };
  var PALET = ["#1C6FD0", "#D63A2A", "#0F7B5A", "#8A5BC4", "#A3742A", "#83334c", "#2da2bb"];
  var MAANDEN = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
  var DAGEN = ["ma","di","wo","do","vr","za","zo"];

  var RES = [], DIENSTEN = [], TEAM = [], KLEURVAN = {};
  var BRON = "Planyo", BEZIG = false;
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
  function sbToken() {
    var t = "";
    try { if (window.BWF && typeof window.BWF.token === "function") t = window.BWF.token() || ""; } catch (e) {}
    return t || SB_KEY;
  }
  function haal(pad) {
    return fetch(SB_URL + "/rest/v1/" + pad, { headers: { apikey: SB_KEY, Authorization: "Bearer " + sbToken() } })
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
    "#bwfKalender .kstatus{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--k-muted);margin-left:auto}",
    "#bwfKalender .kstatus i{width:8px;height:8px;border-radius:50%;background:var(--ok,#3f7a55)}",
    "#bwfKalender .kstatus.fout i{background:var(--crit,#a34434)}",
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
    "#bwfKalender .kdetail{margin-top:12px;border:1px solid var(--k-line);border-radius:16px;background:var(--k-vlak);padding:16px;box-shadow:0 10px 28px -24px rgba(20,32,51,.7)}",
    "#bwfKalender .kdetailkop{display:flex;gap:12px;align-items:start;margin-bottom:12px}",
    "#bwfKalender .kdetailkop strong{font-size:16px}#bwfKalender .kdetailkop button{margin-left:auto;border:0;background:none;font-size:20px;color:var(--k-muted);cursor:pointer}",
    "#bwfKalender .kdetailgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 18px}",
    "#bwfKalender .kdetailgrid span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--k-muted)}",
    "#bwfKalender .kdetailgrid b{display:block;font-size:13.5px;margin-top:2px;overflow-wrap:anywhere}",
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
    "  #bwfKalender .kdetailgrid{grid-template-columns:1fr 1fr}",
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
      '<button class="knu" type="button" data-k="ververs">Verversen</button>' +
    "</div>" +
    '<div class="krooster" id="kRooster"><div class="kleeg">Bezig met laden…</div></div>' +
    '<div class="kdetail" id="kDetail" hidden></div>' +
    '<div class="kvoet" id="kVoet"></div>';

  /* ---------- gegevens ---------- */
  function datumPlus(dagen) {
    var d = new Date(); d.setDate(d.getDate() + dagen); return iso(d);
  }
  function laden() {
    if (BEZIG) return Promise.resolve();
    BEZIG = true;
    var status = document.getElementById("kStatus");
    if (status) status.innerHTML = '<i></i>Planyo laden…';
    var vd = vandaag();
    var taken = [
      window.BWFPlanyo
        ? window.BWFPlanyo.reservations(datumPlus(-730), datumPlus(1095)).catch(function (e) { return { events:[], fout:e.message }; })
        : Promise.resolve({ events:[], fout:"De Planyo-client ontbreekt." }),
      window.BWFAgenda
        ? window.BWFAgenda.events().catch(function (e) { return { events:[], fout:e.message }; })
        : Promise.resolve({ events:[], fout:"De beveiligde agenda-client ontbreekt." }),
      haal("reservations?select=*&order=checkindatum.desc&limit=3000"),
      haal("planning?select=*&order=datum.asc&limit=4000"),
      haal("medewerkers?select=*"),
      /* centrale aanpassingen uit het reserveringenoverzicht (res_koppeling) */
      haal("res_koppeling?select=*&limit=5000")
    ];
    return Promise.all(taken).then(function (uit) {
      var planyoAantal = ((uit[0] && uit[0].events) || []).length;
      var kanalenAantal = ((uit[1] && uit[1].events) || []).length;
      BRON = planyoAantal && kanalenAantal ? "Planyo + boekingskanalen"
        : planyoAantal ? "Planyo" : kanalenAantal ? "Boekingskanalen" : "Geen boekingen ontvangen";
      RES = [];
      var gezien = {};
      function voegEventToe(ev, standaardBron) {
        if (ev.soort !== "reservering" && ev.soort !== "extern") return;
        var locatie = suiteNaam(ev.suite || ev.locatie);
        var naam = ev.gast || ev.naam || ev.titel || "";
        var ref = ev.nummer || ev.referentie || "";
        var sleutel = ref ? "ref-" + String(ref).toLowerCase()
          : [locatie, String(ev.start || "").slice(0, 16), String(naam).toLowerCase()].join("|");
        if (gezien[sleutel]) return;
        gezien[sleutel] = true;
        RES.push({
          locatie: locatie,
          naam: naam,
          start: ev.start, eind: ev.eind,
          ref: ref,
          bron: ev.bron || standaardBron, status: ev.statusLabel || "Bevestigd",
          email: ev.email || "", telefoon: ev.telefoon || "",
          totaal: ev.totaal || 0, betaald: ev.betaald || 0,
          id: (standaardBron === "Planyo" ? "planyo-" : "kanaal-") +
            (ev.id || ev.nummer || (ev.suite + "-" + ev.start))
        });
      }
      ((uit[0] && uit[0].events) || []).forEach(function (ev) { voegEventToe(ev, "Planyo"); });
      ((uit[1] && uit[1].events) || []).forEach(function (ev) { voegEventToe(ev, "Boekingskanaal"); });
      (uit[2] || []).forEach(function (r) {
        var s = String(r.checkindatum || "").slice(0, 10);
        if (!s) return;
        var sleutel = r.referentie ? "ref-" + String(r.referentie).toLowerCase()
          : [suiteNaam(r.locatie), String(r.checkindatum || "").slice(0, 16), String(r.voornaam || "").toLowerCase()].join("|");
        if (gezien[sleutel]) return;
        gezien[sleutel] = true;
        RES.push({
          locatie: suiteNaam(r.locatie),
          naam: [r.voornaam, r.achternaam].filter(Boolean).join(" ") || r.naam || "",
          start: r.checkindatum, eind: r.checkuitdatum,
          ref: r.referentie || "", bron: r.bron || "eigen", status: "Handmatig",
          email: r.email || "", telefoon: r.telefoon || "", totaal: r.totaal || 0,
          betaald: r.betaald || 0, id: "eigen-" + r.id
        });
      });
      /* Aanpassingen die in het reserveringenoverzicht zijn opgeslagen gaan
         voor op de agenda-tekst, zodat één wijziging overal hetzelfde is. */
      var KOPPEL = {};
      (uit[5] || []).forEach(function (k) { if (k && k.res_sleutel) KOPPEL[k.res_sleutel] = k; });
      RES = RES.filter(function (r) {
        var k = KOPPEL[r.ref || (r.id.indexOf("eigen-") === 0 ? "hm-" + r.id.slice(6) : "")];
        if (!k) return true;
        if (k.geannuleerd) return false;
        if (k.gast) r.naam = k.gast;
        if (k.telefoon) r.telefoon = k.telefoon;
        if (k.email) r.email = k.email;
        var a = k.aankomst ? String(k.aankomst).slice(0, 10) : String(r.start || "").slice(0, 10);
        var v = k.vertrek ? String(k.vertrek).slice(0, 10) : String(r.eind || "").slice(0, 10);
        var ti = k.tijd_in ? String(k.tijd_in).slice(0, 5) : tijd(r.start);
        var tu = k.tijd_uit ? String(k.tijd_uit).slice(0, 5) : tijd(r.eind);
        if (k.aankomst || k.tijd_in) r.start = a + (ti ? "T" + ti + ":00" : "");
        if (k.vertrek || k.tijd_uit) r.eind = (v || a) + (tu ? "T" + tu + ":00" : "");
        r.aangepast = true;
        return true;
      });
      DIENSTEN = uit[3] || [];
      TEAM = uit[4] || [];
      TEAM.forEach(function (m, i) { KLEURVAN[m.id] = PALET[i % PALET.length]; });
      maand = vd.slice(0, 7); dag = vd;
      var s = document.getElementById("kStatus");
      if (s) {
        var waarschuwing = uit[0].fout && uit[1].fout;
        s.className = "kstatus" + (waarschuwing ? " fout" : "");
        s.innerHTML = "<i></i>" + esc(BRON) + " bijgewerkt";
      }
      teken();
    }).catch(function (fout) {
      var s = document.getElementById("kStatus");
      if (s) { s.className = "kstatus fout"; s.innerHTML = "<i></i>" + esc(fout.message || "Planyo niet bereikbaar"); }
      document.getElementById("kRooster").innerHTML = '<div class="kleeg"><strong>Agenda nog niet verbonden</strong><br>' + esc(fout.message || "Controleer de Planyo-koppeling.") + "</div>";
    }).finally(function () {
      BEZIG = false;
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
    return '<span class="kev" role="button" tabindex="0" data-event="' + esc(r.id) + '" style="background:' + (KLEUR[r.locatie] || "#9A7B4F") + '" title="' +
      esc((r.locatie || "onbekend") + " · " + (r.naam || "gast") + (r.bron ? " · " + r.bron : "")) + '">' +
      esc(kort(r.locatie) || "?") + " " + (t ? '<span class="t">' + esc(t) + "</span>" : "") +
      esc((overnachting(r) ? "Overnachting" : "Dagverblijf") + " · " + (r.naam || "gast")) + "</span>";
  }
  function euro(n) { return "€ " + (Number(n || 0)).toFixed(2).replace(".", ","); }
  function toonDetail(id) {
    var r = RES.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!r) return;
    var detail = document.getElementById("kDetail");
    detail.innerHTML = '<div class="kdetailkop"><div><strong>' + esc(r.naam || "Gast") + '</strong><div>' + esc(r.locatie || "Locatie onbekend") + '</div></div><button type="button" data-detail-sluit aria-label="Sluiten">×</button></div>' +
      '<div class="kdetailgrid">' +
      '<div><span>Aankomst</span><b>' + esc(dmy(r.start)) + (tijd(r.start) ? " · " + esc(tijd(r.start)) : "") + '</b></div>' +
      '<div><span>Vertrek</span><b>' + esc(dmy(r.eind)) + (tijd(r.eind) ? " · " + esc(tijd(r.eind)) : "") + '</b></div>' +
      '<div><span>Status</span><b>' + esc(r.status || "Onbekend") + '</b></div>' +
      '<div><span>Reservering</span><b>' + esc(r.ref || "—") + '</b></div>' +
      '<div><span>Telefoon</span><b>' + esc(r.telefoon || "—") + '</b></div>' +
      '<div><span>E-mail</span><b>' + esc(r.email || "—") + '</b></div>' +
      '<div><span>Totaal</span><b>' + euro(r.totaal) + '</b></div>' +
      '<div><span>Betaald</span><b>' + euro(r.betaald) + '</b></div>' +
      '<div><span>Bron</span><b>' + esc(r.bron || "Planyo") + '</b></div></div>';
    detail.hidden = false;
    detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
      '<span class="kleg">\u263d nacht \u00b7 \u2726 schoonmaak</span>' +
      '<span class="kstatus" id="kStatus"><i></i>' + esc(BRON) + '</span>';
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
    var sluit = e.target.closest("[data-detail-sluit]");
    if (sluit) { document.getElementById("kDetail").hidden = true; return; }
    var event = e.target.closest("[data-event]");
    if (event) { toonDetail(event.getAttribute("data-event")); return; }
    var k = e.target.closest("[data-k]");
    if (k) {
      if (k.getAttribute("data-k") === "vorige") schuif(-1);
      else if (k.getAttribute("data-k") === "volgende") schuif(1);
      else if (k.getAttribute("data-k") === "ververs") laden();
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
  DOEL.addEventListener("keydown", function (e) {
    var event = e.target.closest && e.target.closest("[data-event]");
    if (event && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toonDetail(event.getAttribute("data-event")); }
  });

  window.addEventListener("bwf:session", function (e) { if (e.detail && e.detail.ingelogd) laden(); });
  if (window.BWFPlanyo && window.BWFPlanyo.setAccessToken && document.getElementById("portaal") && !document.getElementById("portaal").classList.contains("hidden")) laden();
  setInterval(function () { if (!document.hidden) laden(); }, 300000);

  /* Direct verversen zodra een reservering ergens anders is gewijzigd
     (ander tabblad of andere pagina), zonder te wachten op de timer. */
  function bijWijziging() { if (!BEZIG) laden(); }
  if (window.BWFSync) window.BWFSync.bijWijziging(bijWijziging);
  window.addEventListener("bwf:gewijzigd", bijWijziging);
  window.addEventListener("storage", function (e) {
    if (e.key === "bwf-sync" && !window.BWFSync) bijWijziging();
  });
})();
