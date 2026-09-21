/* =========================================================
   bwf-kalender.js — gedeelde kalender (fase 3, versie 3)

   Leest alleen public.reserveringen en public.blokkades (Supabase).
   Wat iemand ziet bepaalt de RLS: locatiemanagers zien alleen hun eigen suites.
   Geen Google Agenda, Planyo, reservations of res_koppeling meer als bron.

   Gebruik:
     <div id="mijnKalender"></div>
     <script src="bwf-kalender.js?v=3"></script>
     <script>
       BWFKalender.maak(document.getElementById("mijnKalender"), {
         weergave: "week",                              // "dag" | "week" | "maand"
         suites: ["malina_jacuzzi", "malina_deluxe"],   // optioneel: alleen deze suites
         token: async () => "…",                        // optioneel: eigen sessie van de pagina
         lijst: true,                                   // uitklaplijst met de gekozen dag
         vrijeBlokken: false,                           // vrije tijdsblokken per suite in de daglijst
         blokkadeOpheffen: async (blokkade) => {},      // optioneel: knop "Opheffen" bij handmatige blokkades
         knoppen: { welkomstcall: true, taak: true },   // optioneel uitzetten; zichtbaar volgens de rol
         naTaak: (taak) => {}                           // optioneel: seintje na een nieuwe taak
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
  /* Eén reserveringsnummer voor iedereen: het nummer van het kanaal als dat er
     is, anders de eerste acht tekens van het id. Dezelfde regel staat in
     reserveringen.html, het dashboard en het incheckformulier, zodat Ruth en
     Kelly over hetzelfde nummer praten. */
  function resNummer(r) {
    return (r && r.kanaal_ref) ? String(r.kanaal_ref) : (r && r.id ? String(r.id).slice(0, 8) : "");
  }

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
  /* Een boeking zonder naam, e-mail én telefoon is in de praktijk geen gast
     maar een dichtgezette dag: zo komen ze binnen uit Booking.com, uit
     Origineel Overnachten zonder naam in de titel, en als handmatige regel in
     de SMG-planning. Geannuleerde regels tellen niet mee - die hebben hun
     eigen weergave. Angela, 21-09-2026. */
  function geenGast(r) {
    if (!r || r.status === "geannuleerd" || r.status === "no_show") return false;
    /* Een boeking met een reserveringsnummer van het kanaal is een echte
       boeking, ook zonder naam: Booking.com levert vaak alleen een nummer en
       een @booking.com-adres mee. Die stonden onterecht als blokkade in de
       agenda. Alleen regels zonder naam, zonder contactgegevens én zonder
       nummer zijn een dichtgezette dag. Angela, 21-09-2026. */
    if (r.kanaal_ref) return false;
    return !gastNaam(r) && !r.gast_email && !r.gast_telefoon;
  }

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
      /* Blokkades in het rood (Angela, 21-09-2026). Stonden eerst in grijs en
         waren daardoor nauwelijks te onderscheiden van een geannuleerde
         boeking. Het streepjespatroon blijft: daarmee zie je in één oogopslag
         dat er niemand komt, ook als je de kleur niet meeweegt. */
      ".bwfk-item.blokkade{--kk:#B3261E;color:#8C1D18;font-weight:600;background:repeating-linear-gradient(135deg,var(--k-bg2) 0 6px,color-mix(in srgb,#B3261E 20%,var(--k-bg)) 6px 12px)}",
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
      ".bwfk-lijst tr.blokkade td{color:#8C1D18;background:repeating-linear-gradient(135deg,transparent 0 8px,color-mix(in srgb,#B3261E 10%,transparent) 8px 16px)}",
      /* Het woord "blokkade" erbij, zodat het ook zonder kleur duidelijk is. */
      ".bwfk-blokmerk{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#fff;background:#B3261E;border-radius:999px;padding:1px 7px;margin-right:6px;vertical-align:1px}",
      /* Wie er die dag werkt, boven aan de dag. */
      ".bwfk-rooster-dag{font-size:11px;color:var(--k-muted);margin:0 0 4px;display:flex;align-items:center;gap:5px;flex-wrap:wrap;line-height:1.35}",
      ".bwfk-rooster-merk{font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--k-ink);background:var(--k-bg2);border:1px solid var(--k-line);border-radius:999px;padding:0 6px}",
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
      /* taakvenster */
      ".bwfk-taakvenster{border:0;border-radius:16px;padding:0;width:min(480px,calc(100vw - 20px));box-shadow:0 30px 90px -30px rgba(0,0,0,.45);color:var(--k-ink);background:var(--k-bg)}",
      ".bwfk-taakvenster::backdrop{background:rgba(20,52,42,.45)}",
      ".bwfk-taakform{padding:20px;display:grid;gap:10px}",
      ".bwfk-taakform h3{font-family:var(--f-titel,'Cormorant Garamond',Georgia,serif);font-weight:500;font-size:22px;margin:0;color:var(--k-accent)}",
      ".bwfk-taaksub{margin:-6px 0 2px;font-size:12.5px;color:var(--k-muted)}",
      ".bwfk-taakform label{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--k-muted)}",
      ".bwfk-taakform input,.bwfk-taakform select,.bwfk-taakform textarea{font:inherit;color:var(--k-ink);padding:8px 10px;border:1px solid var(--k-line);border-radius:10px;background:var(--k-bg2);width:100%}",
      ".bwfk-twee{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
      ".bwfk-taakvoet{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;margin-top:4px}",
      ".bwfk-taakmelding{flex:1;min-width:150px;font-size:12.5px;color:#B3453A}",
      ".bwfk-vol{background:var(--k-accent);border-color:var(--k-accent);color:#fff}",
      ".bwfk-vol:hover{color:#fff;filter:brightness(1.1)}",
      "@media(max-width:760px){",
      ".bwfk-twee{grid-template-columns:1fr}",
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
    p.set("reservering", resNummer(r));
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

  /* ---------- welkomstcall-link: vr2.html?open=welkomstcall vult het formulier alvast in ---------- */
  var KANAAL_WC = { smg: "Privé sauna", booking: "Booking.com", oo: "Origineel Overnachten", planyo: "Planyo", eigen: "Website" };
  function welkomstcallLink(r) {
    var p = new URLSearchParams();
    var s = lokaal(new Date(r.aankomst)), e = lokaal(new Date(r.vertrek));
    p.set("open", "welkomstcall");
    if (gastNaam(r)) p.set("gast", gastNaam(r));
    ["voornaam", "achternaam", "telefoon", "email"].forEach(function (v) { if (r["gast_" + v]) p.set(v, r["gast_" + v]); });
    if (r.kanaal === "smg" && r.kanaal_ref) p.set("nummer", r.kanaal_ref);
    p.set("aankomst", s.datum);
    p.set("vertrek", e.datum);
    p.set("tijdin", hhmm(r.incheck_tijd) || s.tijd);
    p.set("tijduit", hhmm(r.uitcheck_tijd) || e.tijd);
    if (r.type) p.set("type", r.type);
    if (KANAAL_WC[r.kanaal]) p.set("bron", KANAAL_WC[r.kanaal]);
    if (r.suite) p.set("suite", r.suite);
    p.set("rid", r.id);
    if (typeof location !== "undefined") p.set("terug", location.href);
    return "vr2.html?" + p.toString();
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
      /* Blokkades (niet beschikbaar) kunnen verborgen worden, zodat je alleen
         ziet wat er echt geboekt is. Standaard blijven ze zichtbaar: een
         pagina die bezetting toont mag die informatie niet stilzwijgend
         kwijtraken. Een pagina zet blokkadesTonen:false als dat daar beter is. */
      blokkades: opties.blokkadesTonen !== false,
      /* rooster: wie er per dag werkt (tabel planning); mw: de namen erbij. */
      rooster: [], mw: null,
      res: [], blok: [], blokken: null, bereik: "", bezig: false, uitgelicht: null, timer: null,
      rol: undefined, sub: null, mijnId: null, medewerkers: null, taakRes: null
    };
    var beheerUrl = opties.beheerUrl || "reservering-beheer.html";
    var knoppen = Object.assign({ welkomstcall: true, taak: true }, opties.knoppen || {});

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
          /* Angela, 21-09-2026: dit vinkje heette "niet beschikbaar tonen" en
             daarmee was niet duidelijk dat het de blokkades aan- en uitzet. */
          '<label class="bwfk-vink" title="Blokkades zijn dagen waarop er niemand komt: gesloten, onderhoud of via een kanaal dichtgezet.">' +
            '<input type="checkbox" class="bwfk-blok"' + (st.blokkades ? " checked" : "") + '> blokkades tonen</label>' +
          '<button type="button" class="bwfk-knop" data-k="ververs">Verversen</button>' +
        '</div>' +
      '</div>' +
      '<div class="bwfk-status" role="status"></div>' +
      '<div class="bwfk-rooster"></div>' +
      '<div class="bwfk-legenda">' +
        Object.keys(KANALEN).map(function (k) { return '<span><i style="background:' + KANALEN[k].kleur + '"></i>' + esc(KANALEN[k].kort) + '</span>'; }).join("") +
        '<span><i style="background:repeating-linear-gradient(135deg,#f7dedc 0 3px,#B3261E 3px 6px)"></i>blokkade</span>' +
        '<span><i style="background:#ddd"></i>geannuleerd</span>' +
        '<span><i style="border:1px dashed #999"></i>optie</span>' +
      '</div>' +
      (opties.lijst === false ? '' : '<details class="bwfk-lijst" open><summary></summary><div class="bwfk-lijstinhoud"></div></details>') +
      '<dialog class="bwfk-taakvenster"><form method="dialog" class="bwfk-taakform">' +
        '<h3>Taak aanmaken</h3><p class="bwfk-taaksub"></p>' +
        '<label>Titel <input name="titel" type="text" required></label>' +
        '<div class="bwfk-twee"><label>Toewijzen aan <select name="medewerker"></select></label>' +
        '<label>Deadline <input name="deadline" type="date"></label></div>' +
        '<label>Prioriteit <select name="prioriteit"><option value="normaal">Normaal</option><option value="hoog">Hoog</option><option value="laag">Laag</option></select></label>' +
        '<label>Toelichting <textarea name="omschrijving" rows="3"></textarea></label>' +
        '<div class="bwfk-taakvoet"><span class="bwfk-taakmelding" role="status"></span>' +
          '<button type="button" class="bwfk-knop" data-taakactie="annuleer">Annuleren</button>' +
          '<button type="button" class="bwfk-knop bwfk-vol" data-taakactie="bewaar">Taak aanmaken</button></div>' +
      '</form></dialog>';

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

    /* rol en eigen medewerker één keer ophalen: bepaalt welke knoppen in de daglijst staan */
    async function laadRol() {
      if (st.rol !== undefined) return;
      try {
        var token = await (opties.token ? opties.token() : standaardToken());
        if (!token) return;
        var r = await fetch(BASIS + "/rest/v1/rpc/bwf_toegangsrol", {
          method: "POST", headers: { apikey: ANON, Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: "{}"
        });
        st.rol = r.ok ? await r.json() : null;
        st.sub = jwtDeel(token).sub || null;
      } catch (e) { st.rol = null; }
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
        await laadRol();
        var verzoeken = [
          haal("reserveringen?select=" + KOLOMMEN + "&aankomst=lt." + encodeURIComponent(tot) + "&vertrek=gt." + encodeURIComponent(van) + "&order=aankomst.asc&limit=3000"),
          haal("blokkades?select=id,suite,van,tot,reden,bron&actief=eq.true&van=lt." + encodeURIComponent(tot) + "&tot=gt." + encodeURIComponent(van) + "&order=van.asc&limit=1000")
        ];
        if (opties.vrijeBlokken && !st.blokken) verzoeken.push(haal("tijdsblokken?select=suite,naam,begin,eind,volgende_dag&actief=eq.true&order=suite.asc,sortering.asc"));
        var uit = await Promise.all(verzoeken);
        st.res = uit[0] || [];
        st.blok = uit[1] || [];
        if (uit[2]) st.blokken = uit[2];
        /* Wie er die dagen staat ingeroosterd (Angela, 21-09-2026). Apart van
           de verzoeken hierboven, zodat de volgorde van uit[] niet verschuift.
           Stil: is er geen rooster of geen leesrecht, dan blijft de agenda
           gewoon werken en staat er alleen niets boven de dag. */
        /* De twee bevragingen los van elkaar: mislukt de ene, dan houdt de
           andere zijn uitkomst. Eerder zaten ze in één Promise.all en sleepte
           een fout in de ene de andere mee. Wat er misgaat komt in
           st.roosterFout, zodat het zichtbaar gemaakt kan worden in plaats van
           stil te verdwijnen. Angela, 21-09-2026. */
        st.roosterFout = "";
        /* Zonder datumfilter, net als het locatiedashboard dat doet. Met een
           filter op datum kwam de bevraging leeg terug terwijl het rooster er
           wel degelijk is; het dashboard haalt alles op en filtert in het
           geheugen, en dat werkt aantoonbaar. De tabel is klein genoeg.
           roosterVan() filtert alsnog op de dag die je bekijkt.

           Eén keer ophalen is daarmee genoeg: bij het bladeren naar een andere
           maand staat alles er al. De knop Verversen maakt st.rooster leeg en
           haalt het opnieuw op. Angela, 21-09-2026. */
        if (!(st.rooster && st.rooster.length)) {
          try {
            st.rooster = await haal("planning?select=datum,dienst,locatie,medewerker_id" +
              "&order=datum.asc&limit=4000") || [];
          } catch (e) {
            st.rooster = [];
            st.roosterFout = "rooster: " + (e && e.message ? e.message : "onbekende fout");
          }
        }
        if (!st.mw) {
          /* De namen bij het rooster komen uit de tabel medewerkers, niet uit
             wz_medewerkers: planning.medewerker_id verwijst naar de eerste.
             Dat is ook wat vr2 en het locatiedashboard doen. Stond hier alleen
             wz_medewerkers, en dan werd elke dienst "onbekend".
             Allebei ophalen en samenvoegen, zodat het klopt welke van de twee
             er ook in het rooster staat. Angela, 21-09-2026. */
          var samen = [];
          var fouten = [];
          for (var t = 0; t < 2; t++) {
            try {
              var deel = await haal((t === 0 ? "medewerkers" : "wz_medewerkers") + "?select=id,naam") || [];
              deel.forEach(function (m) {
                if (m && m.id && !samen.some(function (x) { return String(x.id) === String(m.id); })) samen.push(m);
              });
            } catch (e) {
              fouten.push((t === 0 ? "medewerkers" : "wz_medewerkers") + ": " + (e && e.message ? e.message : "fout"));
            }
          }
          st.mw = samen;
          /* Alleen melden als er helemaal geen namen zijn opgehaald; lukt een
             van de twee, dan is dat genoeg. */
          if (!samen.length && fouten.length) {
            st.roosterFout = (st.roosterFout ? st.roosterFout + " · " : "") + "namen: " + fouten.join(" / ");
          }
        }
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

    /* Wie er op een dag staat ingeroosterd, als korte tekst. Angela wilde dat
       boven aan de dag zien: dan weet je meteen wie je moet hebben.
       Angela, 21-09-2026. */
    function roosterVan(datum) {
      if (!st.rooster || !st.rooster.length) return [];
      var namen = {};
      (st.mw || []).forEach(function (m) { namen[String(m.id)] = m.naam; });
      return st.rooster
        .filter(function (p) { return String(p.datum || "").slice(0, 10) === datum; })
        .map(function (p) {
          return {
            naam: namen[String(p.medewerker_id)] || "onbekend",
            dienst: p.dienst || "",
            locatie: p.locatie || ""
          };
        });
    }
    function roosterHtml(datum, kort) {
      var lijst = roosterVan(datum);
      if (!lijst.length) return "";
      var tekst = lijst.map(function (x) {
        return kort ? x.naam.split(" ")[0] : x.naam + (x.dienst ? " (" + x.dienst + ")" : "");
      }).join(", ");
      var titel = lijst.map(function (x) {
        return x.naam + (x.dienst ? " — " + x.dienst : "") + (x.locatie ? " — " + x.locatie : "");
      }).join("\n");
      return '<div class="bwfk-rooster-dag" title="' + esc("Ingeroosterd:\n" + titel) + '">' +
        '<span class="bwfk-rooster-merk">dienst</span>' + esc(tekst) + "</div>";
    }

    /* ---------- items per dag ---------- */
    function zichtbaar(suite) { return toegestaan.indexOf(suite) >= 0 && (!st.suite || st.suite === suite); }
    function items() {
      var lijst = [];
      st.res.forEach(function (r) {
        if (!zichtbaar(r.suite)) return;
        if (!st.geannuleerd && (r.status === "geannuleerd" || r.status === "no_show")) return;
        /* Regels zonder gastgegevens gedragen zich als blokkade en vallen dus
           ook onder het vinkje "blokkades tonen". Angela, 21-09-2026. */
        if (!st.blokkades && geenGast(r)) return;
        var d = dagenVan(new Date(r.aankomst), new Date(r.vertrek));
        /* Is er een eigen inchecktijd afgesproken, dan wint die van het
           tijdstempel. Het tijdstempel houdt de begintijd van het geboekte blok
           vast (meestal 13:00), terwijl de werkelijk afgesproken tijd in
           incheck_tijd staat. Alleen de TIJD volgt mee; de datum blijft uit
           aankomst komen, anders zou een reservering naar een andere dag
           verspringen. Gemeten 17-09-2026: vijf reserveringen liepen hierdoor
           uiteen, waaronder een boeking die 19:00 was afgesproken maar in de
           kalender als 13:00 stond. */
        if (r.incheck_tijd) d.startTijd = hhmm(r.incheck_tijd);
        lijst.push({ soort: "res", r: r, d: d, sorteer: d.eerste + " " + d.startTijd });
      });
      st.blok.forEach(function (b) {
        if (!st.blokkades) return;          /* niet beschikbaar wordt niet getekend */
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
        /* Het woord BLOKKADE staat er letterlijk bij. Angela wilde dat je niet
           op kleur alleen hoeft af te gaan: er komt niemand, dus het mag niet
           met een boeking te verwarren zijn. Angela, 21-09-2026. */
        var tekstB = (x.d.eerste === datum && x.d.startTijd !== "00:00" ? x.d.startTijd + " " : "") +
          SUITES[x.b.suite].kort + " · " + (x.b.reden || "gesloten");
        return '<button type="button" class="bwfk-item blokkade" data-blok="' + esc(x.b.id) + '" data-dag="' + datum + '" title="' +
          esc(SUITES[x.b.suite].naam + " — BLOKKADE: " + (x.b.reden || "gesloten") + " (" + dagKort(x.d.eerste) + " " + x.d.startTijd + " – " + dagKort(x.d.eindDatum) + " " + x.d.eindTijd + ")") + '">' +
          '<span class="bwfk-blokmerk">blokkade</span>' + esc(tekstB) + '</button>';
      }
      var r = x.r, kanaal = KANALEN[r.kanaal] || KANALEN.handmatig;
      /* Een regel uit een kanaalfeed zonder gastgegevens is geen gast maar een
         dichtgezette dag: Booking.com levert geen naam mee, en de handmatige
         regels uit de SMG-planning al helemaal niet. Die kregen "gast
         onbekend" en zagen eruit als een boeking. Ze worden nu als blokkade
         getoond, in het rood en met het woord erbij. De boeking zelf blijft
         gewoon bestaan - dit is alleen hoe hij in de agenda oogt.
         Angela, 21-09-2026. */
      var zonderGast = geenGast(r);
      var naam = gastNaam(r) || (zonderGast ? (r.import_opmerking || kanaal.naam) : "gast onbekend");
      var tijd = x.d.eerste === datum ? x.d.startTijd : "vervolg";
      var klassen = ["bwfk-item", r.status, zonderGast ? "blokkade" : "",
        st.uitgelicht === r.id ? "uitgelicht" : ""].join(" ");
      var titel = SUITES[r.suite].naam + " · " + (zonderGast ? "BLOKKADE, geen gastgegevens" : naam) +
        " · " + kanaal.naam + " · " + (TYPES[r.type] || r.type) + " · " +
        dagKort(x.d.eerste) + " " + x.d.startTijd + " – " + dagKort(x.d.eindDatum) + " " + x.d.eindTijd + " · " + (STATUSSEN[r.status] || r.status);
      return '<button type="button" class="' + klassen + '" style="--kk:' +
        (zonderGast ? "#B3261E" : kanaal.kleur) + '" data-res="' + esc(r.id) + '" data-dag="' + datum +
        '" title="' + esc(titel) + '">' +
        (zonderGast ? '<span class="bwfk-blokmerk">blokkade</span>' : '') +
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
              /* roosterHtml met kort=true: in een maandcel is alleen de
                 voornaam leesbaar, de rest staat in de tooltip. */
              roosterHtml(ds, true) +
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
            roosterHtml(dw, true) +
            (dagW.length ? dagW.map(function (x) { return itemHtml(x, dw); }).join("") : '<div class="bwfk-leeg">—</div>') + "</div>";
        }
        html += "</div>";
      } else {
        var dagD = opDag(lijst, st.dag);
        var suites = toegestaan.filter(function (s) { return !st.suite || s === st.suite; });
        /* In de dagweergave is er ruimte voor de volledige naam en de dienst. */
        html = roosterHtml(st.dag, false) +
          '<div class="bwfk-dagkolommen">' + suites.map(function (s) {
          var eigen = dagD.filter(function (x) { return (x.r || x.b).suite === s; });
          return '<div class="bwfk-dagkolom"><h4><i style="background:' + SUITES[s].kleur + '"></i>' + esc(SUITES[s].naam) + '</h4>' +
            (eigen.length ? eigen.map(function (x) { return itemHtml(x, st.dag, true); }).join("") : '<div class="bwfk-leeg">Niets geboekt.</div>') + "</div>";
        }).join("") + "</div>";
      }
      $(".bwfk-rooster").innerHTML = html;
      /* Kort zichtbaar maken hoe het met het rooster staat. Zonder dit is
         "er staat niemand ingeroosterd" niet te onderscheiden van "het rooster
         kon niet worden opgehaald". Angela, 21-09-2026. */
      var legenda = $(".bwfk-legenda");
      if (legenda) {
        var oud = legenda.querySelector(".bwfk-roosterstand");
        if (oud) oud.remove();
        /* Melden zodra er géén namen te tonen zijn - dan valt er iets uit te
           zoeken. Zijn er wel diensten, dan zie je ze vanzelf in de dagen en
           is een telling alleen ruis. Angela, 21-09-2026. */
        if (st.roosterFout || !(st.rooster && st.rooster.length)) {
          var el = document.createElement("span");
          el.className = "bwfk-roosterstand";
          el.style.cssText = "color:#B3261E";
          el.textContent = st.roosterFout
            ? "rooster niet geladen (" + st.roosterFout + ")"
            : "geen diensten in het rooster";
          legenda.appendChild(el);
        }
      }
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
      var magWc = knoppen.welkomstcall && (st.rol === "eigenaar" || st.rol === "vr");
      var magTaak = knoppen.taak && !!st.rol;
      var dagStart = moment(st.dag, "00:00").getTime(), dagEind = moment(plusDagen(st.dag, 1), "00:00").getTime();
      var rijen = st.res.filter(function (r) {
        return zichtbaar(r.suite) && (st.geannuleerd || (r.status !== "geannuleerd" && r.status !== "no_show")) &&
          Date.parse(r.aankomst) < dagEind && Date.parse(r.vertrek) > dagStart;
      });
      /* Let op: hier alleen de WEERGAVE. De berekening van vrije tijdsblokken
         verderop blijft alle blokkades meenemen — een verborgen blokkade houdt
         de tijd bezet, en zou anders als vrij worden aangeboden. */
      var blokken = !st.blokkades ? [] :
        st.blok.filter(function (b) { return zichtbaar(b.suite) && Date.parse(b.van) < dagEind && Date.parse(b.tot) > dagStart; });
      /* Wie er die dag werkt hoort in de kop die je altijd ziet. Hij stond
         eerst boven de dagkolommen, maar die staan niet in elk scherm in
         beeld - in het locatiedashboard zie je alleen deze lijst.
         Angela, 21-09-2026. */
      var dienstTekst = roosterVan(st.dag).map(function (x) {
        return x.naam + (x.dienst ? " (" + x.dienst + ")" : "");
      }).join(", ");
      $(".bwfk-lijst>summary").textContent = "Reserveringen op " + dagLang(st.dag) + " (" + rijen.length + ")" +
        (blokken.length ? " · " + blokken.length + " blokkade" + (blokken.length === 1 ? "" : "s") : "") +
        (dienstTekst ? " · dienst: " + dienstTekst : "");

      function tijdTekst(van, tot, eigenTijd, isRes) {
        var s = lokaal(new Date(van)), e = lokaal(new Date(tot));
        /* Dezelfde voorrang als in de dagcel: een afgesproken inchecktijd wint
           van de begintijd van het blok. Alleen de tijd, niet de datum. */
        if (eigenTijd) s.tijd = hhmm(eigenTijd);
        /* Beide momenten krijgen hun eigen woord en hun eigen dag. Er stond
           eerder alleen "19:00 – vr 18 sep 11:00", en dat laat zich lezen als
           een incheck op de 18e terwijl de gast op de 17e aankomt. Angela liep
           daar op 17-09-2026 tegenaan; vandaar de labels en de dag erbij.
           Een blokkade heeft geen gast, dus daar heet het van en tot. */
        var beginTekst = (isRes ? "aankomst " : "van ") + dagKort(s.datum) + " " + s.tijd;
        var eindTekst = (isRes ? "vertrek " : "tot ") + dagKort(e.datum) + " " + e.tijd;
        /* Valt de gekozen dag tussen aankomst en vertrek in, dan is dat het
           enige wat je verder nog moet weten. Die aanduiding stond er eerder
           ook en blijft dus staan. */
        var midden = (s.datum !== st.dag && e.datum !== st.dag) ? "<small>verblijft</small>" : "";
        return esc(beginTekst) + "<small>" + esc(eindTekst) + "</small>" + midden;
      }
      var regels = rijen.map(function (r) {
        var kanaal = KANALEN[r.kanaal] || KANALEN.handmatig;
        /* Zie geenGast(): een regel zonder gastgegevens is een dichtgezette dag
           en krijgt dezelfde rode opmaak als een echte blokkade. */
        var zonderGast = geenGast(r);
        return { sorteer: r.aankomst, html: '<tr class="' + esc(r.status) + (zonderGast ? " blokkade" : "") + (st.uitgelicht === r.id ? " uitgelicht" : "") + '" data-rij="' + esc(r.id) + '">' +
          "<td>" + tijdTekst(r.aankomst, r.vertrek, r.incheck_tijd, true) + "</td>" +
          '<td><span class="bwfk-suitestip" style="background:' + SUITES[r.suite].kleur + '"></span> ' + esc(SUITES[r.suite].naam) + "<small>" + esc(TYPES[r.type] || r.type) + "</small></td>" +
          '<td class="bwfk-naam" title="' + esc(zonderGast ? "Blokkade: geen gastgegevens" : (gastNaam(r) || "gast onbekend")) + '">' +
            (zonderGast
              ? '<span class="bwfk-blokmerk">blokkade</span>' + esc(r.import_opmerking || kanaal.naam)
              : (gastNaam(r) ? esc(gastNaam(r)) : '<span style="color:var(--k-muted)">gast onbekend</span>')) +
            (r.personen ? "<small>" + esc(r.personen) + " pers.</small>" : "") + "</td>" +
          '<td><span class="bwfk-kanaal" style="--kk:' + kanaal.kleur + '"><i></i>' + esc(kanaal.naam) + "</span>" + (resNummer(r) ? "<small>nr. " + esc(resNummer(r)) + "</small>" : "") + "</td>" +
          '<td><span class="bwfk-pil ' + esc(r.status) + '">' + esc(STATUSSEN[r.status] || r.status) + "</span></td>" +
          '<td><div class="bwfk-acties"><a href="' + esc(beheerUrl + "?id=" + encodeURIComponent(r.id)) + '" target="_top">Reservering</a>' +
            '<a href="' + esc(incheckLink(r)) + '" target="_top">Incheckformulier</a>' +
            (magWc ? '<a href="' + esc(welkomstcallLink(r)) + '" target="_top">Welkomstcall</a>' : "") +
            (magTaak ? '<button type="button" data-taak="' + esc(r.id) + '">Taak</button>' : "") + '</div></td></tr>' };
      }).concat(blokken.map(function (b) {
        return { sorteer: b.van, html: '<tr class="blokkade">' +
          "<td>" + tijdTekst(b.van, b.tot) + "</td>" +
          '<td><span class="bwfk-suitestip" style="background:' + SUITES[b.suite].kleur + '"></span> ' + esc(SUITES[b.suite].naam) + "<small>blokkade</small></td>" +
          '<td class="bwfk-naam" title="' + esc(b.reden || "") + '">' +
            '<span class="bwfk-blokmerk">blokkade</span>' + esc(b.reden || "gesloten") + "</td>" +
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
      if ((t = e.target.closest("[data-taak]"))) { openTaak(t.getAttribute("data-taak")); return; }
      if ((t = e.target.closest("[data-taakactie]"))) {
        if (t.getAttribute("data-taakactie") === "bewaar") bewaarTaak(); else $(".bwfk-taakvenster").close();
        return;
      }
      if (e.target.closest(".bwfk-taakvenster")) return;
      if ((t = e.target.closest("[data-res]"))) { e.stopPropagation(); kiesDag(t.getAttribute("data-dag"), t.getAttribute("data-res")); return; }
      if ((t = e.target.closest("[data-blok]"))) { e.stopPropagation(); kiesDag(t.getAttribute("data-dag"), null); return; }
      if ((t = e.target.closest("[data-k]"))) {
        var k = t.getAttribute("data-k");
        if (k === "vorige") schuif(-1);
        else if (k === "volgende") schuif(1);
        else if (k === "vandaag") { st.dag = vandaag(); st.uitgelicht = null; laad(); }
        /* Verversen haalt ook het rooster opnieuw op; verder blijft dat in het
           geheugen staan, want het wordt in één keer voor alle datums geladen. */
        else if (k === "ververs") { st.rooster = []; st.mw = null; laad(); }
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
      if (e.target.classList.contains("bwfk-blok")) { st.blokkades = e.target.checked; teken(); }
    });

    /* ---------- taak aanmaken ---------- */
    async function openTaak(id) {
      var r = st.res.find(function (x) { return x.id === id; });
      if (!r) return;
      st.taakRes = r;
      var f = $(".bwfk-taakform"), s = lokaal(new Date(r.aankomst)), m = $(".bwfk-taakmelding");
      f.titel.value = (gastNaam(r) || "Gast onbekend") + " — " + SUITES[r.suite].kort + " " + dagKort(s.datum);
      f.deadline.value = s.datum;
      f.prioriteit.value = "normaal";
      f.omschrijving.value = "";
      $(".bwfk-taaksub").textContent = SUITES[r.suite].naam + " · " + (KANALEN[r.kanaal] || KANALEN.handmatig).naam + " · " + dagKort(s.datum) + " " + s.tijd;
      m.textContent = "";
      f.medewerker.innerHTML = '<option value="">Niet toegewezen</option>';
      try {
        if (!st.medewerkers) st.medewerkers = await haal("wz_medewerkers?select=id,naam,auth_id&actief=eq.true&order=naam.asc");
        f.medewerker.innerHTML += st.medewerkers.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.naam) + '</option>'; }).join("");
        var ik = st.medewerkers.find(function (x) { return x.auth_id && x.auth_id === st.sub; });
        st.mijnId = ik ? ik.id : null;
        if (ik) f.medewerker.value = ik.id;
      } catch (err) { m.textContent = err.message; }
      var dlg = $(".bwfk-taakvenster");
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
      f.titel.focus();
    }

    async function bewaarTaak() {
      var f = $(".bwfk-taakform"), r = st.taakRes, m = $(".bwfk-taakmelding");
      var knop = houder.querySelector('[data-taakactie="bewaar"]');
      var titel = f.titel.value.trim();
      if (!r) return;
      if (!titel) { m.textContent = "Geef de taak een titel."; return; }
      knop.disabled = true;
      try {
        var token = await (opties.token ? opties.token() : standaardToken());
        if (!token) throw new Error("log opnieuw in");
        var resp = await fetch(BASIS + "/rest/v1/wz_taken", {
          method: "POST",
          headers: { apikey: ANON, Authorization: "Bearer " + token, "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify({
            titel: titel, omschrijving: f.omschrijving.value.trim() || null, medewerker_id: f.medewerker.value || null,
            deadline: f.deadline.value || null, prioriteit: f.prioriteit.value, status: "open", bron: "agenda",
            link: beheerUrl + "?id=" + r.id, aangemaakt_door: st.mijnId
          })
        });
        var tekst = await resp.text();
        if (!resp.ok) { var fout = tekst; try { fout = JSON.parse(tekst).message || tekst; } catch (x) {} throw new Error(fout || "fout " + resp.status); }
        var taak = (JSON.parse(tekst) || [])[0];
        if (!taak) throw new Error("geen rechten om een taak aan te maken");
        $(".bwfk-taakvenster").close();
        status("Taak aangemaakt voor " + (f.medewerker.value ? f.medewerker.options[f.medewerker.selectedIndex].text : "niemand") + ": " + titel);
        if (typeof opties.naTaak === "function") { try { opties.naTaak(taak); } catch (x) {} }
      } catch (err) {
        m.textContent = "Taak aanmaken lukte niet: " + err.message;
      } finally {
        knop.disabled = false;
      }
    }
    houder.addEventListener("submit", function (e) { if (e.target.classList.contains("bwfk-taakform")) e.preventDefault(); });

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
    welkomstcallLink: welkomstcallLink,
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
