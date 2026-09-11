/* =========================================================
   bwf-kalender.js — gedeelde kalender (fase 3, versie 2)

   Leest alleen public.reserveringen en public.blokkades (Supabase).
   Wat iemand ziet bepaalt de RLS: locatiemanagers zien alleen hun eigen suites.
   Geen Google Agenda, Planyo, reservations of res_koppeling meer als bron.

   Gebruik:
     <div id="mijnKalender"></div>
     <script src="bwf-kalender.js?v=2"></script>
     <script>
       BWFKalender.maak(document.getElementById("mijnKalender"), {
         weergave: "week",                              // "dag" | "week" | "maand"
         suites: ["malina_jacuzzi", "malina_deluxe"],   // optioneel: alleen deze suites
         token: async () => "…",                        // optioneel: eigen sessie van de pagina
         lijst: true,                                   // uitklaplijst met de gekozen dag
         vrijeBlokken: false,                           // vrije tijdsblokken per suite in de daglijst
         blokkadeOpheffen: async (blokkade) => {}       // optioneel: knop "Opheffen" bij handmatige blokkades
       });
     </script>
   Staat er een <div id="bwfKalender"> op de pagina, dan start hij daar vanzelf.
   ========================================================= */
(function () {
  "use strict";

  var PROJECT = "iuyjvtlauktnjprbmbjj";
  var BASIS = "https://" + PROJECT + ".supabase.co";
  var ANON = "sb_publishable_SfQjQTwKa3BgCtjwE-8ljw_mTpqEY3U";
  var SESSIE_SLEUTEL = "sb-" + PROJECT + "-auth-token";
  var TZ = "Europe/Amsterdam";

  var SUITES = {
    angie:          { naam: "Suite Angie",    plaats: "Almere",   kort: "Angie",   kleur: "#B9975B" },
    malina_jacuzzi: { naam: "Malina Jacuzzi", plaats: "Lelystad", kort: "Jacuzzi", kleur: "#2E7D9A" },
    malina_deluxe:  { naam: "Malina Deluxe",  plaats: "Lelystad", kort: "Deluxe",  kleur: "#1F4D3D" }
  };
  var KANALEN = {
    smg:       { naam: "Privésauna (SMG)",      kort: "SMG",     kleur: "#7A4E9C" },
    booking:   { naam: "Booking.com",           kort: "Booking", kleur: "#1F5AA6" },
    oo:        { naam: "Origineel Overnachten", kort: "OO",      kleur: "#B86B25" },
    planyo:    { naam: "Planyo",                kort: "Planyo",  kleur: "#2E7D53" },
    eigen:     { naam: "Eigen website",         kort: "Eigen",   kleur: "#14342A" },
    handmatig: { naam: "Handmatig",             kort: "Handm.",  kleur: "#6B7A72" }
  };
  var TYPES = { dagverblijf: "Dagverblijf", avond: "Avond", overnachting: "Overnachting", late_checkin: "Late check-in", honeymoon: "Honeymoon" };
  var STATUSSEN = { bevestigd: "Bevestigd", optie: "Optie", geannuleerd: "Geannuleerd", no_show: "No-show" };
  var KOLOMMEN = "id,suite,kanaal,kanaal_ref,status,type,aankomst,vertrek,incheck_tijd,uitcheck_tijd," +
    "gast_voornaam,gast_achternaam,gast_email,gast_telefoon,personen,arrangementen,bedrag_totaal,restant_bedrag," +
    "omschrijving,import_opmerking";
  var MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

  /* ---------- datum en tijd, altijd in Amsterdamse tijd ---------- */
  var fmtDelen = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  });
  var fmtDagKort = new Intl.DateTimeFormat("nl-NL", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
  var fmtDagLang = new Intl.DateTimeFormat("nl-NL", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });

  /* Date → { datum: "JJJJ-MM-DD", tijd: "UU:MM" } in Amsterdam */
  function lokaal(d) {
    var p = {};
    fmtDelen.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    return { datum: p.year + "-" + p.month + "-" + p.day, tijd: p.hour + ":" + p.minute };
  }
  /* "JJJJ-MM-DD" + "UU:MM" in Amsterdam → Date */
  function moment(datum, tijd) {
    var gok = new Date(datum + "T" + (tijd || "00:00") + ":00Z");
    var l = lokaal(gok);
    var verschuiving = Date.parse(l.datum + "T" + l.tijd + ":00Z") - gok.getTime();
    return new Date(gok.getTime() - verschuiving);
  }
  function plusDagen(datum, n) {
    var d = new Date(datum + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function weekdag(datum) { return (new Date(datum + "T12:00:00Z").getUTCDay() + 6) % 7; } /* 0 = maandag */
  function vandaag() { return lokaal(new Date()).datum; }
  function dagKort(datum) { return fmtDagKort.format(new Date(datum + "T12:00:00Z")); }
  function dagLang(datum) { return fmtDagLang.format(new Date(datum + "T12:00:00Z")); }
  var hhmm = function (t) { return t ? String(t).slice(0, 5) : ""; };

  /* Op welke dagen staat een verblijf? Van de aankomstdag t/m de laatste nacht:
     vertrekt iemand de volgende ochtend (tot 12:00), dan telt die vertrekdag niet mee. */
  function dagenVan(start, eind) {
    var s = lokaal(start), e = lokaal(eind);
    var laatste = (e.datum > s.datum && e.tijd <= "12:00") ? plusDagen(e.datum, -1) : e.datum;
    if (laatste < s.datum) laatste = s.datum;
    return { eerste: s.datum, laatste: laatste, startTijd: s.tijd, eindTijd: e.tijd, eindDatum: e.datum };
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function gastNaam(r) { return [r.gast_voornaam, r.gast_achternaam].filter(Boolean).join(" "); }

  /* ---------- sessie (standaard: de gewone Supabase-sessie van de site) ---------- */
  function jwtDeel(t) {
    try { return JSON.parse(atob(String(t).split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch (e) { return {}; }
  }
  var verversBezig = null;
  async function standaardToken() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(SESSIE_SLEUTEL) || "null"); } catch (e) {}
    if (!s || !s.access_token) return null;
    if (((jwtDeel(s.access_token).exp || 0) * 1000) - Date.now() > 60000) return s.access_token;
    if (!s.refresh_token) return null;
    if (!verversBezig) {
      verversBezig = fetch(BASIS + "/auth/v1/token?grant_type=refresh_token", {
        method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: s.refresh_token })
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (!d || !d.access_token) return null;
        try { localStorage.setItem(SESSIE_SLEUTEL, JSON.stringify(d)); } catch (e) {}
        return d.access_token;
      }).catch(function () { return null; }).finally(function () { verversBezig = null; });
    }
    return verversBezig;
  }

  /* ---------- opmaak (één keer per pagina) ---------- */
  function zetStijl() {
    if (document.getElementById("bwfk-stijl")) return;
    var css = document.createElement("style");
    css.id = "bwfk-stijl";
    css.textContent = [
      ".bwfk{--k-line:var(--line,#E6E1D7);--k-soft:var(--line-soft,#F0ECE4);--k-bg:var(--surface,#fff);--k-bg2:var(--surface-2,#FBF9F5);",
      "--k-ink:var(--ink,#1D2420);--k-muted:var(--muted,#7E8A82);--k-accent:var(--groen,var(--accent,#14342A));--k-goud:var(--goud,#B9975B);",
      "font-family:var(--f-body,'Public Sans','Helvetica Neue',Arial,sans-serif);color:var(--k-ink);font-size:14px}",
      ".bwfk *{box-sizing:border-box}",
      ".bwfk-balk{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}",
      ".bwfk-balk .bwfk-titel{font-family:var(--f-titel,'Cormorant Garamond',Georgia,serif);font-size:22px;color:var(--k-accent);margin:0 6px;min-width:0}",
      ".bwfk button,.bwfk select{font:inherit;color:inherit}",
      ".bwfk-knop{border:1px solid var(--k-line);background:var(--k-bg2);border-radius:999px;padding:6px 13px;cursor:pointer;white-space:nowrap}",
      ".bwfk-knop:hover{border-color:var(--k-accent);color:var(--k-accent)}",
      ".bwfk-knop[aria-pressed=true]{background:var(--k-accent);border-color:var(--k-accent);color:#fff}",
      ".bwfk-rond{width:34px;height:34px;padding:0;border-radius:50%}",
      ".bwfk-seg{display:inline-flex;gap:4px}",
      ".bwfk-rechts{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
      ".bwfk select{border:1px solid var(--k-line);background:var(--k-bg2);border-radius:10px;padding:6px 10px}",
      ".bwfk-vink{display:inline-flex;gap:5px;align-items:center;font-size:13px;color:var(--k-muted);cursor:pointer}",
      ".bwfk-status{font-size:12.5px;color:var(--k-muted);min-height:1.2em;margin:4px 2px}",
      ".bwfk-status.fout{color:#B3453A}",
      /* rooster */
      ".bwfk-rooster{border:1px solid var(--k-line);border-radius:12px;background:var(--k-bg);overflow:hidden}",
      ".bwfk-koprij,.bwfk-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}",
      ".bwfk-koprij div{padding:7px 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--k-muted);border-bottom:1px solid var(--k-line)}",
      ".bwfk-cel{min-height:96px;border-right:1px solid var(--k-soft);border-bottom:1px solid var(--k-soft);padding:5px;cursor:pointer;min-width:0;background:var(--k-bg);text-align:left;border-top:0;border-left:0;font:inherit;color:inherit;display:block;width:100%}",
      ".bwfk-cel:hover{background:var(--k-bg2)}",
      ".bwfk-cel[data-buiten='1']{background:var(--k-bg2);color:var(--k-muted)}",
      ".bwfk-cel[data-gekozen='1']{box-shadow:inset 0 0 0 2px var(--k-goud)}",
      ".bwfk-dagnr{font-size:12px;font-weight:600;margin-bottom:3px;display:flex;justify-content:space-between;gap:4px}",
      ".bwfk-cel[data-vandaag='1'] .bwfk-dagnr b{background:var(--k-accent);color:#fff;border-radius:999px;padding:0 7px}",
      ".bwfk-week .bwfk-cel{min-height:260px}",
      ".bwfk-meer{font-size:11.5px;color:var(--k-muted);padding:1px 4px}",
      /* item: afkappen met … */
      ".bwfk-item{display:block;width:100%;border:0;border-left:4px solid var(--kk,#6B7A72);background:color-mix(in srgb,var(--kk,#6B7A72) 12%,var(--k-bg));",
      "border-radius:6px;padding:2px 6px;margin:0 0 3px;font-size:12px;line-height:1.35;text-align:left;cursor:pointer;",
      "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--k-ink)}",
      ".bwfk-item b{font-weight:600}",
      ".bwfk-item.optie{border-left-style:dashed;outline:1px dashed color-mix(in srgb,var(--kk) 55%,transparent);outline-offset:-1px}",
      ".bwfk-item.geannuleerd,.bwfk-item.no_show{--kk:#A7AEAA;color:var(--k-muted);text-decoration:line-through;background:var(--k-bg2)}",
      ".bwfk-item.blokkade{--kk:#8B8F8C;color:var(--k-ink);background:repeating-linear-gradient(135deg,var(--k-bg2) 0 6px,color-mix(in srgb,#8B8F8C 22%,var(--k-bg)) 6px 12px)}",
      ".bwfk-item.uitgelicht{box-shadow:0 0 0 2px var(--k-goud)}",
      /* dagweergave */
      ".bwfk-dagkolommen{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0}",
      ".bwfk-dagkolom{padding:10px;border-right:1px solid var(--k-soft);min-width:0}",
      ".bwfk-dagkolom h4{margin:0 0 8px;font-size:13px;display:flex;align-items:center;gap:6px}",
      ".bwfk-dagkolom h4 i,.bwfk-suitestip{display:inline-block;width:9px;height:9px;border-radius:50%;flex:none}",
      ".bwfk-dagkolom .bwfk-item{font-size:13px;padding:5px 8px;margin-bottom:5px}",
      ".bwfk-leeg{color:var(--k-muted);font-size:12.5px}",
      /* legenda */
      ".bwfk-legenda{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--k-muted);margin:8px 2px 0}",
      ".bwfk-legenda span{display:inline-flex;align-items:center;gap:5px}",
      ".bwfk-legenda i{width:14px;height:10px;border-radius:3px;display:inline-block}",
      /* daglijst */
      ".bwfk-lijst{margin-top:12px;border:1px solid var(--k-line);border-radius:12px;background:var(--k-bg)}",
      ".bwfk-lijst>summary{cursor:pointer;padding:12px 14px;font-weight:600;list-style-position:inside}",
      ".bwfk-lijst .bwfk-tabel{overflow-x:auto}",
      ".bwfk-lijst table{width:100%;border-collapse:collapse;font-size:13.5px}",
      ".bwfk-lijst th{text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--k-muted);padding:8px 12px;border-top:1px solid var(--k-line);border-bottom:1px solid var(--k-line);white-space:nowrap}",
      ".bwfk-lijst td{padding:9px 12px;border-bottom:1px solid var(--k-soft);vertical-align:top}",
      ".bwfk-lijst tr.geannuleerd td,.bwfk-lijst tr.no_show td{color:var(--k-muted)}",
      ".bwfk-lijst tr.blokkade td{background:repeating-linear-gradient(135deg,transparent 0 8px,color-mix(in srgb,#8B8F8C 10%,transparent) 8px 16px)}",
      ".bwfk-lijst tr.uitgelicht td{background:color-mix(in srgb,var(--k-goud) 14%,transparent)}",
      ".bwfk-lijst td small{display:block;color:var(--k-muted);font-size:12px}",
      ".bwfk-naam{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".bwfk-pil{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;white-space:nowrap;background:var(--k-bg2);border:1px solid var(--k-line)}",
      ".bwfk-pil.bevestigd{background:#E6F2EA;color:#2E7D53;border-color:transparent}",
      ".bwfk-pil.optie{background:#FBF1DA;color:#8A6408;border-color:transparent}",
      ".bwfk-pil.geannuleerd,.bwfk-pil.no_show{background:#F1F0EE;color:#8B8F8C;border-color:transparent}",
      ".bwfk-kanaal{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}",
      ".bwfk-kanaal i{width:8px;height:8px;border-radius:2px;background:var(--kk)}",
      ".bwfk-acties{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}",
      ".bwfk-acties a,.bwfk-acties button{font-size:12.5px;padding:4px 10px;border-radius:999px;border:1px solid var(--k-line);background:var(--k-bg2);color:var(--k-ink);text-decoration:none;white-space:nowrap;cursor:pointer}",
      ".bwfk-acties a:hover,.bwfk-acties button:hover{border-color:var(--k-accent);color:var(--k-accent)}",
      ".bwfk-vrij{padding:10px 14px;border-top:1px solid var(--k-line);font-size:13px;display:grid;gap:6px}",
      ".bwfk-vrij span.blok{display:inline-block;margin:2px 4px 2px 0;padding:1px 8px;border-radius:999px;background:#E6F2EA;color:#2E7D53;font-size:12px}",
      "@media(max-width:760px){",
      ".bwfk-koprij{display:none}",
      ".bwfk-maand .bwfk-week{grid-template-columns:1fr}",
      ".bwfk-maand .bwfk-cel{min-height:0}",
      ".bwfk-maand .bwfk-cel[data-leeg='1']{display:none}",
      ".bwfk-week.bwfk-weekweergave{grid-template-columns:1fr}",
      ".bwfk-week .bwfk-cel{min-height:0}",
      ".bwfk-balk .bwfk-rechts{margin-left:0}",
      "}"
    ].join("");
    document.head.appendChild(css);
  }

  /* ---------- incheckformulier-link (zelfde parameters als vandaag.html) ---------- */
  var KANAAL_INCHECK = { smg: "Prive sauna", booking: "Booking.com", oo: "Origineel overnachten" };
  function incheckLink(r) {
    var p = new URLSearchParams();
    var s = lokaal(new Date(r.aankomst)), e = lokaal(new Date(r.vertrek));
    p.set("reservering", r.kanaal_ref || r.id);
    p.set("locatie", r.suite);
    p.set("van", s.datum);
    if (["overnachting", "late_checkin", "honeymoon"].indexOf(r.type) >= 0 && e.datum > s.datum) p.set("tot", e.datum);
    p.set("tijdin", hhmm(r.incheck_tijd) || s.tijd);
    p.set("tijduit", hhmm(r.uitcheck_tijd) || e.tijd);
    if (r.personen) p.set("personen", r.personen);
    if (r.bedrag_totaal != null) {
      p.set("totaal", r.bedrag_totaal);
      if (r.restant_bedrag != null) p.set("betaald", Math.max(0, Number(r.bedrag_totaal) - Number(r.restant_bedrag)));
    }
    p.set("kanaal", KANAAL_INCHECK[r.kanaal] || "Anders");
    var arr = (Array.isArray(r.arrangementen) ? r.arrangementen : []).map(function (a) {
      return typeof a === "string" ? a : (a && (a.naam || a.tekst)) || "";
    }).filter(Boolean).join(", ");
    if (arr) p.set("arrangement", arr);
    ["voornaam", "achternaam", "email", "telefoon"].forEach(function (v) { if (r["gast_" + v]) p.set(v, r["gast_" + v]); });
    if (r.omschrijving) p.set("opmerking", r.omschrijving);
    return "incheckformulier.html?" + p.toString();
  }

  /* =========================================================
     Eén kalender
     ========================================================= */
  function maak(houder, opties) {
    if (!houder) return null;
    opties = opties || {};
    zetStijl();

    var toegestaan = Array.isArray(opties.suites) && opties.suites.length ? opties.suites.slice() : Object.keys(SUITES);
    var st = {
      weergave: ["dag", "week", "maand"].indexOf(opties.weergave) >= 0 ? opties.weergave : "maand",
      dag: /^\d{4}-\d{2}-\d{2}$/.test(opties.datum || "") ? opties.datum : vandaag(),
      suite: toegestaan.indexOf(opties.suite) >= 0 ? opties.suite : "",
      geannuleerd: opties.geannuleerdTonen !== false,
      res: [], blok: [], blokken: null, bereik: "", bezig: false, uitgelicht: null, timer: null
    };
    var beheerUrl = opties.beheerUrl || "reservering-beheer.html";

    houder.classList.add("bwfk");
    houder.innerHTML =
      '<div class="bwfk-balk">' +
        '<button type="button" class="bwfk-knop bwfk-rond" data-k="vorige" aria-label="Vorige">&larr;</button>' +
        '<button type="button" class="bwfk-knop bwfk-rond" data-k="volgende" aria-label="Volgende">&rarr;</button>' +
        '<button type="button" class="bwfk-knop" data-k="vandaag">Vandaag</button>' +
        '<h3 class="bwfk-titel" aria-live="polite"></h3>' +
        '<div class="bwfk-rechts">' +
          '<span class="bwfk-seg" role="group" aria-label="Weergave">' +
            '<button type="button" class="bwfk-knop" data-v="dag">Dag</button>' +
            '<button type="button" class="bwfk-knop" data-v="week">Week</button>' +
            '<button type="button" class="bwfk-knop" data-v="maand">Maand</button>' +
          '</span>' +
          (toegestaan.length > 1 ? '<select class="bwfk-suite" aria-label="Suite"><option value="">Alle suites</option>' +
            toegestaan.map(function (s) { return '<option value="' + s + '">' + esc(SUITES[s].naam) + '</option>'; }).join("") + '</select>' : '') +
          '<label class="bwfk-vink"><input type="checkbox" class="bwfk-geann"' + (st.geannuleerd ? " checked" : "") + '> geannuleerd tonen</label>' +
          '<button type="button" class="bwfk-knop" data-k="ververs">Verversen</button>' +
        '</div>' +
      '</div>' +
      '<div class="bwfk-status" role="status"></div>' +
      '<div class="bwfk-rooster"></div>' +
      '<div class="bwfk-legenda">' +
        Object.keys(KANALEN).map(function (k) { return '<span><i style="background:' + KANALEN[k].kleur + '"></i>' + esc(KANALEN[k].kort) + '</span>'; }).join("") +
        '<span><i style="background:repeating-linear-gradient(135deg,#eee 0 3px,#bbb 3px 6px)"></i>blokkade</span>' +
        '<span><i style="background:#ddd"></i>geannuleerd</span>' +
        '<span><i style="border:1px dashed #999"></i>optie</span>' +
      '</div>' +
      (opties.lijst === false ? '' : '<details class="bwfk-lijst" open><summary></summary><div class="bwfk-lijstinhoud"></div></details>');

    var $ = function (s) { return houder.querySelector(s); };
    if ($(".bwfk-suite")) $(".bwfk-suite").value = st.suite;

    function status(tekst, fout) {
      var el = $(".bwfk-status");
      el.textContent = tekst || "";
      el.classList.toggle("fout", !!fout);
    }

    /* ---------- periode ---------- */
    function periode() {
      if (st.weergave === "dag") return { van: st.dag, tot: st.dag };
      if (st.weergave === "week") { var ma = plusDagen(st.dag, -weekdag(st.dag)); return { van: ma, tot: plusDagen(ma, 6) }; }
      var eerste = st.dag.slice(0, 8) + "01";
      var start = plusDagen(eerste, -weekdag(eerste));
      return { van: start, tot: plusDagen(start, 41), maand: eerste };
    }

    /* ---------- laden ---------- */
    async function haal(pad) {
      var token = await (opties.token ? opties.token() : standaardToken());
      if (!token) throw new Error("Log in om de agenda te zien.");
      var r = await fetch(BASIS + "/rest/v1/" + pad, { headers: { apikey: ANON, Authorization: "Bearer " + token } });
      if (r.status === 401) throw new Error("Je sessie is verlopen. Log opnieuw in.");
      if (!r.ok) throw new Error("Laden lukte niet (" + r.status + ").");
      return r.json();
    }

    async function laad(stil) {
      var p = periode();
      /* ruim om de periode heen, zodat meerdaagse verblijven meekomen */
      var van = moment(plusDagen(p.van, -1), "00:00").toISOString();
      var tot = moment(plusDagen(p.tot, 2), "00:00").toISOString();
      var bereik = van + "|" + tot;
      if (st.bezig) return;
      st.bezig = true;
      if (!stil) status("Laden…");
      try {
        var verzoeken = [
          haal("reserveringen?select=" + KOLOMMEN + "&aankomst=lt." + encodeURIComponent(tot) + "&vertrek=gt." + encodeURIComponent(van) + "&order=aankomst.asc&limit=3000"),
          haal("blokkades?select=id,suite,van,tot,reden,bron&actief=eq.true&van=lt." + encodeURIComponent(tot) + "&tot=gt." + encodeURIComponent(van) + "&order=van.asc&limit=1000")
        ];
        if (opties.vrijeBlokken && !st.blokken) verzoeken.push(haal("tijdsblokken?select=suite,naam,begin,eind,volgende_dag&actief=eq.true&order=suite.asc,sortering.asc"));
        var uit = await Promise.all(verzoeken);
        st.res = uit[0] || [];
        st.blok = uit[1] || [];
        if (uit[2]) st.blokken = uit[2];
        st.bereik = bereik;
        status("");
        teken();
      } catch (e) {
        status(e.message, true);
        if (!st.res.length) teken();
      } finally {
        st.bezig = false;
      }
    }

    /* ---------- items per dag ---------- */
    function zichtbaar(suite) { return toegestaan.indexOf(suite) >= 0 && (!st.suite || st.suite === suite); }
    function items() {
      var lijst = [];
      st.res.forEach(function (r) {
        if (!zichtbaar(r.suite)) return;
        if (!st.geannuleerd && (r.status === "geannuleerd" || r.status === "no_show")) return;
        var d = dagenVan(new Date(r.aankomst), new Date(r.vertrek));
        lijst.push({ soort: "res", r: r, d: d, sorteer: d.eerste + " " + d.startTijd });
      });
      st.blok.forEach(function (b) {
        if (!zichtbaar(b.suite)) return;
        var d = dagenVan(new Date(b.van), new Date(b.tot));
        lijst.push({ soort: "blok", b: b, d: d, sorteer: d.eerste + " " + d.startTijd });
      });
      return lijst.sort(function (a, b) { return a.sorteer < b.sorteer ? -1 : a.sorteer > b.sorteer ? 1 : 0; });
    }
    function opDag(lijst, datum) {
      return lijst.filter(function (x) { return x.d.eerste <= datum && x.d.laatste >= datum; });
    }

    function itemHtml(x, datum, groot) {
      if (x.soort === "blok") {
        var tekstB = (x.d.eerste === datum && x.d.startTijd !== "00:00" ? x.d.startTijd + " " : "") +
          SUITES[x.b.suite].kort + " · " + (x.b.reden || "Blokkade");
        return '<button type="button" class="bwfk-item blokkade" data-blok="' + esc(x.b.id) + '" data-dag="' + datum + '" title="' +
          esc(SUITES[x.b.suite].naam + " — blokkade: " + (x.b.reden || "") + " (" + dagKort(x.d.eerste) + " " + x.d.startTijd + " – " + dagKort(x.d.eindDatum) + " " + x.d.eindTijd + ")") + '">' +
          esc(tekstB) + '</button>';
      }
      var r = x.r, kanaal = KANALEN[r.kanaal] || KANALEN.handmatig;
      var naam = gastNaam(r) || "gast onbekend";
      var tijd = x.d.eerste === datum ? x.d.startTijd : "vervolg";
      var klassen = ["bwfk-item", r.status, st.uitgelicht === r.id ? "uitgelicht" : ""].join(" ");
      var titel = SUITES[r.suite].naam + " · " + naam + " · " + kanaal.naam + " · " + (TYPES[r.type] || r.type) + " · " +
        dagKort(x.d.eerste) + " " + x.d.startTijd + " – " + dagKort(x.d.eindDatum) + " " + x.d.eindTijd + " · " + (STATUSSEN[r.status] || r.status);
      return '<button type="button" class="' + klassen + '" style="--kk:' + kanaal.kleur + '" data-res="' + esc(r.id) + '" data-dag="' + datum + '" title="' + esc(titel) + '">' +
        '<b>' + esc(tijd) + '</b> ' + (groot ? '' : esc(SUITES[r.suite].kort) + ' · ') + esc(naam) + '</button>';
    }

    /* ---------- tekenen ---------- */
    function teken() {
      var p = periode(), lijst = items(), vd = vandaag();
      houder.querySelectorAll("[data-v]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === st.weergave)); });
      var titel = $(".bwfk-titel");
      if (st.weergave === "dag") titel.textContent = dagLang(st.dag);
      else if (st.weergave === "week") titel.textContent = dagKort(p.van) + " – " + dagKort(p.tot);
      else titel.textContent = MAANDEN[Number(p.maand.slice(5, 7)) - 1] + " " + p.maand.slice(0, 4);

      var kop = '<div class="bwfk-koprij">' + ["ma", "di", "wo", "do", "vr", "za", "zo"].map(function (d) { return "<div>" + d + "</div>"; }).join("") + "</div>";
      var html = "";
      if (st.weergave === "maand") {
        html = '<div class="bwfk-maand">' + kop;
        for (var w = 0; w < 6; w++) {
          html += '<div class="bwfk-week">';
          for (var i = 0; i < 7; i++) {
            var ds = plusDagen(p.van, w * 7 + i), dag = opDag(lijst, ds);
            html += '<div class="bwfk-cel" role="button" tabindex="0" data-cel="' + ds + '" data-buiten="' + (ds.slice(0, 7) !== p.maand.slice(0, 7) ? 1 : 0) + '"' +
              ' data-vandaag="' + (ds === vd ? 1 : 0) + '" data-gekozen="' + (ds === st.dag ? 1 : 0) + '" data-leeg="' + (dag.length ? 0 : 1) + '">' +
              '<div class="bwfk-dagnr"><b>' + Number(ds.slice(8)) + '</b><span class="bwfk-meer">' + (dag.length ? dag.length : "") + '</span></div>' +
              dag.slice(0, 3).map(function (x) { return itemHtml(x, ds); }).join("") +
              (dag.length > 3 ? '<div class="bwfk-meer">+' + (dag.length - 3) + ' meer</div>' : "") + "</div>";
          }
          html += "</div>";
        }
        html += "</div>";
      } else if (st.weergave === "week") {
        html = kop + '<div class="bwfk-week bwfk-weekweergave">';
        for (var j = 0; j < 7; j++) {
          var dw = plusDagen(p.van, j), dagW = opDag(lijst, dw);
          html += '<div class="bwfk-cel" role="button" tabindex="0" data-cel="' + dw + '" data-vandaag="' + (dw === vd ? 1 : 0) + '" data-gekozen="' + (dw === st.dag ? 1 : 0) + '" data-leeg="' + (dagW.length ? 0 : 1) + '">' +
            '<div class="bwfk-dagnr"><b>' + esc(dagKort(dw)) + '</b></div>' +
            (dagW.length ? dagW.map(function (x) { return itemHtml(x, dw); }).join("") : '<div class="bwfk-leeg">—</div>') + "</div>";
        }
        html += "</div>";
      } else {
        var dagD = opDag(lijst, st.dag);
        var suites = toegestaan.filter(function (s) { return !st.suite || s === st.suite; });
        html = '<div class="bwfk-dagkolommen">' + suites.map(function (s) {
          var eigen = dagD.filter(function (x) { return (x.r || x.b).suite === s; });
          return '<div class="bwfk-dagkolom"><h4><i style="background:' + SUITES[s].kleur + '"></i>' + esc(SUITES[s].naam) + '</h4>' +
            (eigen.length ? eigen.map(function (x) { return itemHtml(x, st.dag, true); }).join("") : '<div class="bwfk-leeg">Niets geboekt.</div>') + "</div>";
        }).join("") + "</div>";
      }
      $(".bwfk-rooster").innerHTML = html;
      tekenLijst(lijst);
    }

    function vrijeBlokkenHtml() {
      if (!opties.vrijeBlokken || !st.blokken) return "";
      var dagStart = moment(st.dag, "00:00").getTime();
      var regels = toegestaan.filter(function (s) { return !st.suite || s === st.suite; }).map(function (s) {
        var bezet = st.res.filter(function (r) { return r.suite === s && r.status !== "geannuleerd" && r.status !== "no_show"; })
          .map(function (r) { return [Date.parse(r.aankomst), Date.parse(r.vertrek)]; })
          .concat(st.blok.filter(function (b) { return b.suite === s; }).map(function (b) { return [Date.parse(b.van), Date.parse(b.tot)]; }));
        var vrij = st.blokken.filter(function (tb) { return tb.suite === s; }).filter(function (tb) {
          var b = moment(st.dag, hhmm(tb.begin)).getTime();
          var e = moment(tb.volgende_dag ? plusDagen(st.dag, 1) : st.dag, hhmm(tb.eind)).getTime();
          if (e <= Date.now()) return false;
          return !bezet.some(function (x) { return x[0] < e && x[1] > b; });
        });
        return '<div><span class="bwfk-suitestip" style="background:' + SUITES[s].kleur + '"></span> <b>' + esc(SUITES[s].naam) + '</b>: ' +
          (vrij.length ? vrij.map(function (tb) { return '<span class="blok">' + esc(tb.naam) + '</span>'; }).join("") : '<span class="bwfk-leeg">niets meer vrij</span>') + '</div>';
      });
      return dagStart ? '<div class="bwfk-vrij"><div><b>Nog vrij op deze dag</b></div>' + regels.join("") + '</div>' : "";
    }

    function tekenLijst(lijst) {
      var lijstEl = $(".bwfk-lijst");
      if (!lijstEl) return;
      var dagStart = moment(st.dag, "00:00").getTime(), dagEind = moment(plusDagen(st.dag, 1), "00:00").getTime();
      var rijen = st.res.filter(function (r) {
        return zichtbaar(r.suite) && (st.geannuleerd || (r.status !== "geannuleerd" && r.status !== "no_show")) &&
          Date.parse(r.aankomst) < dagEind && Date.parse(r.vertrek) > dagStart;
      });
      var blokken = st.blok.filter(function (b) { return zichtbaar(b.suite) && Date.parse(b.van) < dagEind && Date.parse(b.tot) > dagStart; });
      $(".bwfk-lijst>summary").textContent = "Reserveringen op " + dagLang(st.dag) + " (" + rijen.length + ")" + (blokken.length ? " · " + blokken.length + " blokkade" + (blokken.length === 1 ? "" : "s") : "");

      function tijdTekst(van, tot) {
        var s = lokaal(new Date(van)), e = lokaal(new Date(tot));
        var begin = s.datum === st.dag ? s.tijd : dagKort(s.datum) + " " + s.tijd;
        var eind = e.datum === st.dag ? e.tijd : dagKort(e.datum) + " " + e.tijd;
        var soort = s.datum === st.dag ? "aankomst" : e.datum === st.dag ? "vertrek" : "verblijft";
        return esc(begin + " – " + eind) + "<small>" + soort + "</small>";
      }
      var regels = rijen.map(function (r) {
        var kanaal = KANALEN[r.kanaal] || KANALEN.handmatig;
        return { sorteer: r.aankomst, html: '<tr class="' + esc(r.status) + (st.uitgelicht === r.id ? " uitgelicht" : "") + '" data-rij="' + esc(r.id) + '">' +
          "<td>" + tijdTekst(r.aankomst, r.vertrek) + "</td>" +
          '<td><span class="bwfk-suitestip" style="background:' + SUITES[r.suite].kleur + '"></span> ' + esc(SUITES[r.suite].naam) + "<small>" + esc(TYPES[r.type] || r.type) + "</small></td>" +
          '<td class="bwfk-naam" title="' + esc(gastNaam(r) || "gast onbekend") + '">' + (gastNaam(r) ? esc(gastNaam(r)) : '<span style="color:var(--k-muted)">gast onbekend</span>') +
            (r.personen ? "<small>" + esc(r.personen) + " pers.</small>" : "") + "</td>" +
          '<td><span class="bwfk-kanaal" style="--kk:' + kanaal.kleur + '"><i></i>' + esc(kanaal.naam) + "</span>" + (r.kanaal === "smg" && r.kanaal_ref ? "<small>nr. " + esc(r.kanaal_ref) + "</small>" : "") + "</td>" +
          '<td><span class="bwfk-pil ' + esc(r.status) + '">' + esc(STATUSSEN[r.status] || r.status) + "</span></td>" +
          '<td><div class="bwfk-acties"><a href="' + esc(beheerUrl + "?id=" + encodeURIComponent(r.id)) + '" target="_top">Reservering</a>' +
            '<a href="' + esc(incheckLink(r)) + '" target="_top">Incheckformulier</a></div></td></tr>' };
      }).concat(blokken.map(function (b) {
        return { sorteer: b.van, html: '<tr class="blokkade">' +
          "<td>" + tijdTekst(b.van, b.tot) + "</td>" +
          '<td><span class="bwfk-suitestip" style="background:' + SUITES[b.suite].kleur + '"></span> ' + esc(SUITES[b.suite].naam) + "<small>blokkade</small></td>" +
          '<td class="bwfk-naam" title="' + esc(b.reden || "") + '">' + esc(b.reden || "Blokkade") + "</td>" +
          "<td>" + esc(b.bron === "handmatig" ? "Handmatig" : b.bron === "ics-booking" ? "Booking.com" : b.bron === "ics-smg" ? "SMG-planning" : b.bron) + "</td>" +
          '<td><span class="bwfk-pil">Gesloten</span></td>' +
          '<td><div class="bwfk-acties">' + (opties.blokkadeOpheffen && b.bron === "handmatig" ? '<button type="button" data-opheffen="' + esc(b.id) + '">Opheffen</button>' : "") + "</div></td></tr>" };
      })).sort(function (a, b) { return a.sorteer < b.sorteer ? -1 : a.sorteer > b.sorteer ? 1 : 0; });

      $(".bwfk-lijstinhoud").innerHTML = (regels.length
        ? '<div class="bwfk-tabel"><table><thead><tr><th>Tijd</th><th>Suite</th><th>Gast</th><th>Kanaal</th><th>Status</th><th></th></tr></thead><tbody>' +
          regels.map(function (x) { return x.html; }).join("") + "</tbody></table></div>"
        : '<div class="bwfk-leeg" style="padding:12px 14px">Geen reserveringen of blokkades op deze dag.</div>') + vrijeBlokkenHtml();
    }

    /* ---------- bediening ---------- */
    function schuif(stap) {
      if (st.weergave === "dag") st.dag = plusDagen(st.dag, stap);
      else if (st.weergave === "week") st.dag = plusDagen(st.dag, 7 * stap);
      else {
        var j = Number(st.dag.slice(0, 4)), m = Number(st.dag.slice(5, 7)) - 1 + stap;
        j += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
        st.dag = j + "-" + String(m + 1).padStart(2, "0") + "-01";
      }
      st.uitgelicht = null;
      laad();
    }
    function kiesDag(datum, id) {
      var p = periode();
      st.dag = datum;
      st.uitgelicht = id || null;
      var np = periode();
      if (np.van !== p.van) laad(); else teken();
      var lijstEl = $(".bwfk-lijst");
      if (lijstEl) {
        lijstEl.open = true;
        if (id) {
          var rij = houder.querySelector('[data-rij="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
          if (rij && rij.scrollIntoView) rij.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }

    houder.addEventListener("click", async function (e) {
      var t;
      if ((t = e.target.closest("[data-opheffen]"))) {
        var blok = st.blok.find(function (b) { return b.id === t.getAttribute("data-opheffen"); });
        if (!blok || !opties.blokkadeOpheffen) return;
        t.disabled = true;
        try { await opties.blokkadeOpheffen(blok); await laad(true); } catch (err) { status(err.message, true); t.disabled = false; }
        return;
      }
      if (e.target.closest(".bwfk-acties a")) return;
      if ((t = e.target.closest("[data-res]"))) { e.stopPropagation(); kiesDag(t.getAttribute("data-dag"), t.getAttribute("data-res")); return; }
      if ((t = e.target.closest("[data-blok]"))) { e.stopPropagation(); kiesDag(t.getAttribute("data-dag"), null); return; }
      if ((t = e.target.closest("[data-k]"))) {
        var k = t.getAttribute("data-k");
        if (k === "vorige") schuif(-1);
        else if (k === "volgende") schuif(1);
        else if (k === "vandaag") { st.dag = vandaag(); st.uitgelicht = null; laad(); }
        else if (k === "ververs") laad();
        return;
      }
      if ((t = e.target.closest("[data-v]"))) { st.weergave = t.getAttribute("data-v"); laad(); return; }
      if ((t = e.target.closest("[data-cel]"))) { kiesDag(t.getAttribute("data-cel"), null); }
    });
    houder.addEventListener("keydown", function (e) {
      var cel = e.target.closest("[data-cel]");
      if (cel && (e.key === "Enter" || e.key === " ") && e.target === cel) { e.preventDefault(); kiesDag(cel.getAttribute("data-cel"), null); }
    });
    houder.addEventListener("change", function (e) {
      if (e.target.classList.contains("bwfk-suite")) { st.suite = e.target.value; teken(); }
      if (e.target.classList.contains("bwfk-geann")) { st.geannuleerd = e.target.checked; teken(); }
    });

    /* verversen: elke 5 minuten, na een wijziging elders, en wanneer de sessie beschikbaar komt */
    st.timer = setInterval(function () { laad(true); }, 5 * 60 * 1000);
    window.addEventListener("bwf:gewijzigd", function () { laad(true); });
    window.addEventListener("storage", function (e) {
      if (e.key === "bwf-sync") laad(true);
      if (e.key === SESSIE_SLEUTEL && e.newValue && !st.res.length) laad(true);
    });
    window.addEventListener("bwf:session", function () { laad(true); });
    if (!opties.token) {
      /* pagina's die zelf inloggen (bijv. index.html) zetten de sessie pas later */
      var wacht = setInterval(async function () {
        if (st.res.length || st.bereik) { clearInterval(wacht); return; }
        if (await standaardToken()) { clearInterval(wacht); laad(true); }
      }, 4000);
    }

    teken();
    laad();

    return {
      ververs: function () { return laad(true); },
      naarDatum: function (datum) { if (/^\d{4}-\d{2}-\d{2}$/.test(datum)) kiesDag(datum, null); },
      zetWeergave: function (w) { if (["dag", "week", "maand"].indexOf(w) >= 0) { st.weergave = w; laad(); } }
    };
  }

  window.BWFKalender = {
    maak: maak,
    SUITES: SUITES,
    KANALEN: KANALEN,
    incheckLink: incheckLink,
    _test: { lokaal: lokaal, moment: moment, plusDagen: plusDagen, weekdag: weekdag, dagenVan: dagenVan }
  };

  /* automatisch starten op <div id="bwfKalender"> (index.html) */
  if (typeof document !== "undefined") {
    var start = function () {
      var el = document.getElementById("bwfKalender");
      if (el && !el.classList.contains("bwfk")) maak(el, { weergave: "maand" });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }
})();
