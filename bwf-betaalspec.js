/* Betaalspecificatie per reservering, op één plek.
   ===========================================================================
   Angela, 10-10-2026: "ik wil een specificatie zien hoe alles is betaald -
   niet één betaalwijze per boeking, maar los van elkaar: aanbetaling,
   restantbetaling, extra's via de welkomstcall en extra's op locatie, en
   achter elk item hoe het is betaald."

   Gebruikt door de reserveringskaart (reserveringen.html) en door "Betaling
   per reservering" in het VR-dashboard (vr2.html). Eén berekening, zodat beide
   schermen hetzelfde zeggen.

   Waar de gegevens vandaan komen - er wordt niets nieuws opgehaald:
     - de posten: het verblijf (totaal min de extra's) en elke bijgeboekte
       regel uit `arrangementen` (bron bijgeboekt, welkomstcall, op_locatie, …)
     - de betalingen: de regels met bron "betaling" in `arrangementen` (die
       schrijft "Betaling afronden" weg), de betaalde Mollie-links, en wat er
       daarnaast al als betaald op de boeking stond (betaald_bedrag) - dat
       laatste met de betaalwijze uit betaald_via.

   Vanaf nu legt "Betaling afronden" bij elke betaling vast welke posten hij
   dekt (`dekt`) en wat voor betaling het is (`soort`). Oudere betalingen
   hebben dat niet; die worden verdeeld in de volgorde verblijf eerst, daarna
   de extra's van oud naar nieuw. Wat dan nog openstaat valt op de nieuwste
   extra's - want die zijn er het laatst bij gekomen.

   Gebruik:
     const s = BWFBetaalSpec.bereken(reservering, molliePaidRijen);
     el.innerHTML = BWFBetaalSpec.html(s);
     BWFBetaalSpec.samenvatting(s)   -> [{wijze, bedrag}] voor een korte regel
     BWFBetaalSpec.nieuweBetaling(r, bedrag, keuze, mollie) -> {soort, dekt}
*/
(function (global) {
  "use strict";

  var GROEP = {
    bijgeboekt: "Vooraf bijgeboekt",
    welkomstcall: "Welkomstcall",
    op_locatie: "Op locatie",
    incheckformulier: "Incheckformulier"
  };
  var SOORT = {
    aanbetaling: "Aanbetaling",
    restant: "Restantbetaling",
    volledig: "Volledige betaling",
    extras: "Extra's",
    eerder: "Eerder betaald",
    cadeaubon: "Cadeaubon"
  };

  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function euro(n) {
    return "€ " + (Number(n) || 0).toLocaleString("nl-NL",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function dag(t) {
    if (!t) return "";
    var d = new Date(t);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit" });
  }

  /* Een sleutel per extra, zodat een betaling kan vastleggen wélke regel hij
     dekte. Geen plek in de lijst: die verschuift als er een regel weggaat. */
  function sleutelVan(a, nr) {
    return [a.bron || "", a.naam || "", r2(a.bedrag), a.tijdstip || "", nr || 0].join("|");
  }

  function extrasVan(r) {
    var arr = Array.isArray(r && r.arrangementen) ? r.arrangementen : [];
    var gezien = {};
    var uit = [];
    arr.forEach(function (a, i) {
      if (!a || typeof a !== "object" || !a.bron || a.bron === "betaling") return;
      if (a.member === true || a.korting === true) return;
      var b = r2(a.bedrag);
      if (!(b > 0)) return;
      var basis = sleutelVan(a, 0);
      gezien[basis] = (gezien[basis] || 0) + 1;
      uit.push({
        sleutel: sleutelVan(a, gezien[basis] - 1),
        plek: i,
        soort: a.bron,
        groep: GROEP[a.bron] || "Bijgeboekt",
        naam: (a.naam || "extra") + (Number(a.aantal) > 1 ? " × " + a.aantal : ""),
        bedrag: b,
        tijdstip: a.tijdstip || "",
        betaaldVia: a.betaald ? (a.betaald_via || "") : "",
        betaaldOp: a.betaald_op || ""
      });
    });
    return uit;
  }

  /* Wat er al binnen is volgens de boeking zelf. Bij een betaalde boeking is
     betaald_bedrag vaak leeg; dan is het totaal min wat er nog openstaat. */
  function openVan(r) {
    var totaal = r.bedrag_totaal != null ? Number(r.bedrag_totaal) : null;
    var stand = String(r.betaalstatus || "open");
    if (r.restant_bedrag != null && Number(r.restant_bedrag) > 0.004) return r2(r.restant_bedrag);
    if (stand === "betaald") return 0;
    if (stand === "open") return totaal != null ? totaal : 0;
    if (r.restant_bedrag != null) return r2(r.restant_bedrag);
    if (totaal != null && r.betaald_bedrag != null) return r2(totaal - Number(r.betaald_bedrag));
    return 0;
  }
  function betaaldVolgensBoeking(r) {
    if (r.betaald_bedrag != null && Number(r.betaald_bedrag) > 0) return r2(r.betaald_bedrag);
    if (r.bedrag_totaal != null && String(r.betaalstatus || "open") !== "open")
      return Math.max(0, r2(Number(r.bedrag_totaal) - openVan(r)));
    return 0;
  }

  function isMollie(w) { return /mollie/i.test(String(w || "")); }

  /* Alle betalingen bij elkaar, oudste eerst. */
  function betalingenVan(r, mollie) {
    var arr = Array.isArray(r && r.arrangementen) ? r.arrangementen : [];
    var lijst = [];
    arr.forEach(function (a) {
      if (!a || a.bron !== "betaling") return;
      var b = r2(a.betaald_bedrag);
      if (!(b > 0)) return;
      lijst.push({
        bedrag: b,
        wijze: a.betaalwijze || "onbekend",
        verdeling: Array.isArray(a.verdeling) ? a.verdeling : null,
        tijdstip: a.tijdstip || "",
        door: a.door || "",
        notitie: a.notitie || "",
        soort: a.soort || "",
        dekt: Array.isArray(a.dekt) ? a.dekt : null,
        bron: "kaart"
      });
    });
    /* Betaalde Mollie-links. Is zo'n betaling met de hand overgenomen, dan staat
       hij hierboven al als regel: niet dubbel tellen. */
    var genomen = [];
    (mollie || []).forEach(function (m) {
      if (!m || m.status && m.status !== "paid") return;
      var b = r2(m.bedrag);
      if (!(b > 0)) return;
      var dubbel = lijst.some(function (x, i) {
        if (genomen.indexOf(i) >= 0 || !isMollie(x.wijze) || Math.abs(x.bedrag - b) > 0.01) return false;
        genomen.push(i); return true;
      });
      if (dubbel) return;
      lijst.push({
        bedrag: b, wijze: "Mollie betaallink", tijdstip: m.betaald_op || m.bijgewerkt_op || "",
        soort: m.soort === "extras" ? "extras" : "", mollieSoort: m.soort || "", bron: "mollie"
      });
    });
    /* Wat er volgens de boeking betaald is maar hierboven niet terugkomt: dat is
       betaald vóórdat dit werd bijgehouden (online, Booking.com, SMG, …). */
    var bekend = r2(lijst.reduce(function (t, x) { return t + x.bedrag; }, 0));
    var verschil = r2(betaaldVolgensBoeking(r) - bekend);
    if (verschil > 0.01) {
      var via = String(r.betaald_via || "").replace(/\s*\+\s*Cadeaubon/i, "").trim();
      lijst.push({ bedrag: verschil, wijze: via || "niet vastgelegd", tijdstip: "", soort: "",
        bron: "eerder", onbekend: !via });
    }
    lijst.sort(function (a, b) {
      if (a.bron === "eerder" && b.bron !== "eerder") return -1;
      if (b.bron === "eerder" && a.bron !== "eerder") return 1;
      return String(a.tijdstip || "").localeCompare(String(b.tijdstip || ""));
    });
    return lijst;
  }

  function wijzeTekst(p) {
    if (p.verdeling && p.verdeling.length) {
      return p.verdeling.map(function (d) { return d.wijze + " " + euro(d.bedrag); }).join(" + ");
    }
    return p.wijze;
  }

  function bereken(r, mollie) {
    r = r || {};
    var totaal = r.bedrag_totaal != null ? r2(r.bedrag_totaal) : null;
    var extras = extrasVan(r);
    var somExtras = r2(extras.reduce(function (t, x) { return t + x.bedrag; }, 0));
    var posten = [];
    if (totaal != null) {
      posten.push({ sleutel: "verblijf", groep: "Boeking", naam: "Verblijf",
        bedrag: Math.max(0, r2(totaal - somExtras)), delen: [] });
    }
    extras.forEach(function (x) {
      posten.push({ sleutel: x.sleutel, groep: x.groep, naam: x.naam, bedrag: x.bedrag,
        tijdstip: x.tijdstip, betaaldVia: x.betaaldVia, betaaldOp: x.betaaldOp, delen: [] });
    });
    posten.forEach(function (p) { p.rest = p.bedrag; });
    var perSleutel = {};
    posten.forEach(function (p) { perSleutel[p.sleutel] = p; });

    var betalingen = betalingenVan(r, mollie);
    betalingen.forEach(function (b) { b.rest = b.bedrag; b.gedekt = []; });

    function boek(b, p, bedrag) {
      bedrag = r2(Math.min(bedrag, p.rest, b.rest));
      if (!(bedrag > 0)) return;
      p.rest = r2(p.rest - bedrag); b.rest = r2(b.rest - bedrag);
      p.delen.push({ bedrag: bedrag, betaling: b });
      b.gedekt.push({ post: p, bedrag: bedrag });
    }

    /* 1. Betalingen die zelf zeggen wat ze dekten. */
    betalingen.forEach(function (b) {
      (b.dekt || []).forEach(function (d) {
        var p = perSleutel[d.sleutel];
        if (p) boek(b, p, r2(d.bedrag));
      });
    });
    /* 2. Extra's die als betaald gemerkt zijn met een betaalwijze: koppelen aan
          een betaling met die wijze. */
    posten.forEach(function (p) {
      if (!p.betaaldVia || !(p.rest > 0)) return;
      betalingen.forEach(function (b) {
        if (p.rest > 0 && b.rest > 0 && String(b.wijze).indexOf(p.betaaldVia) >= 0) boek(b, p, p.rest);
      });
    });
    /* 3. De rest: verblijf eerst, daarna de extra's van oud naar nieuw. Een
          Mollie-link voor extra's gaat eerst naar de extra's. */
    betalingen.forEach(function (b) {
      if (!(b.rest > 0)) return;
      var volgorde = posten.slice();
      if (b.soort === "extras") volgorde = volgorde.slice(1).concat(volgorde.slice(0, 1));
      volgorde.forEach(function (p) { if (b.rest > 0 && p.rest > 0) boek(b, p, p.rest); });
    });

    /* Het soort betaling benoemen, als dat niet al vastligt. */
    var verblijf = perSleutel.verblijf;
    var verblijfBetaald = 0;
    betalingen.forEach(function (b, i) {
      var opVerblijf = r2(b.gedekt.filter(function (g) { return g.post === verblijf; })
        .reduce(function (t, g) { return t + g.bedrag; }, 0));
      verblijfBetaald = r2(verblijfBetaald + opVerblijf);
      if (b.soort && SOORT[b.soort]) return;
      if (/cadeaubon/i.test(b.wijze)) b.soort = "cadeaubon";
      else if (b.gedekt.length && !opVerblijf) b.soort = "extras";
      else if (verblijf && verblijfBetaald + 0.005 < verblijf.bedrag) b.soort = "aanbetaling";
      else if (i > 0) b.soort = "restant";
      else if (b.bron === "eerder" && !b.gedekt.length) b.soort = "eerder";
      else b.soort = "volledig";
    });

    /* Wat er volgens de boeking nog openstaat, verdelen over de posten die nog
       niet gedekt zijn - de nieuwste eerst. Klopt het niet met de posten (een
       totaal dat niet is meegegroeid, bijvoorbeeld), dan zegt het blok dat. */
    var open = openVan(r);
    var openPosten = r2(posten.reduce(function (t, p) { return t + p.rest; }, 0));

    return {
      totaal: totaal,
      open: open,
      openPosten: openPosten,
      betaald: r2(betalingen.reduce(function (t, b) { return t + b.bedrag; }, 0)),
      posten: posten,
      betalingen: betalingen,
      /* Wat het kanaal zelf opgeeft (Privésauna-mail, Planyo). De servicekosten
         zitten al in het totaal; ze staan hier alleen om te tonen. */
      servicekosten: r.servicekosten != null && Number(r.servicekosten) > 0 ? r2(r.servicekosten) : null,
      arrangementenTekst: String(r.arrangementen_tekst || "").split("\n")
        .map(function (x) { return x.trim(); }).filter(Boolean),
      klopt: Math.abs(open - openPosten) < 0.01
    };
  }

  /* Per betaalwijze opgeteld, voor een korte regel in een lijst. */
  function samenvatting(s) {
    var per = {};
    var volgorde = [];
    s.betalingen.forEach(function (b) {
      var delen = b.verdeling && b.verdeling.length ? b.verdeling : [{ wijze: b.wijze, bedrag: b.bedrag }];
      delen.forEach(function (d) {
        var w = d.wijze || "onbekend";
        if (!(w in per)) { per[w] = 0; volgorde.push(w); }
        per[w] = r2(per[w] + Number(d.bedrag || 0));
      });
    });
    return volgorde.map(function (w) { return { wijze: w, bedrag: per[w] }; });
  }

  /* Voor "Betaling afronden": welke posten dekt een nieuwe betaling van
     `bedrag`? keuze: "aanbetaling", "restant" of "volledig". Een aanbetaling
     gaat naar het verblijf; de rest eerst naar wat het langst openstaat. */
  function nieuweBetaling(r, bedrag, keuze, mollie) {
    var s = bereken(r, mollie);
    var over = r2(bedrag);
    var dekt = [];
    var volgorde = s.posten.filter(function (p) { return p.rest > 0; });
    if (keuze === "aanbetaling") volgorde = volgorde.filter(function (p) { return p.sleutel === "verblijf"; });
    volgorde.forEach(function (p) {
      var deel = r2(Math.min(over, p.rest));
      if (deel > 0) { dekt.push({ sleutel: p.sleutel, naam: p.naam, groep: p.groep, bedrag: deel }); over = r2(over - deel); }
    });
    /* Blijft er iets over (een totaal dat niet is meegegroeid), dan hoort dat
       bij het verblijf - nooit stil laten verdwijnen. */
    if (over > 0) {
      var v = dekt.filter(function (d) { return d.sleutel === "verblijf"; })[0];
      if (v) v.bedrag = r2(v.bedrag + over);
      else dekt.push({ sleutel: "verblijf", naam: "Verblijf", groep: "Boeking", bedrag: over });
    }
    var opVerblijf = dekt.some(function (d) { return d.sleutel === "verblijf"; });
    var nogOpen = r2(s.openPosten - bedrag);
    var soort = keuze === "aanbetaling" ? "aanbetaling"
      : !opVerblijf ? "extras"
      : nogOpen > 0.005 ? "aanbetaling"
      : s.betaald > 0 ? "restant" : "volledig";
    /* Welke extra's zijn hiermee helemaal betaald: die kunnen gemerkt worden. */
    var helemaal = dekt.filter(function (d) {
      var p = s.posten.filter(function (x) { return x.sleutel === d.sleutel; })[0];
      return d.sleutel !== "verblijf" && p && d.bedrag + 0.005 >= p.rest;
    }).map(function (d) { return d.sleutel; });
    return { soort: soort, dekt: dekt, helemaalBetaald: helemaal, sleutelVan: sleutelVan };
  }

  /* Merkt de extra's in een arrangementenlijst als betaald. Geeft een nieuwe
     lijst terug; de oude blijft onaangeroerd. */
  function merkBetaald(arr, sleutels, wijze, door, nu) {
    var gezien = {};
    return (Array.isArray(arr) ? arr : []).map(function (a) {
      if (!a || typeof a !== "object" || !a.bron || a.bron === "betaling") return a;
      var basis = sleutelVan(a, 0);
      gezien[basis] = (gezien[basis] || 0) + 1;
      var s = sleutelVan(a, gezien[basis] - 1);
      if (sleutels.indexOf(s) < 0 || a.betaald) return a;
      var kopie = {};
      for (var k in a) kopie[k] = a[k];
      kopie.betaald = true; kopie.betaald_via = wijze; kopie.betaald_op = nu; kopie.betaald_door = door;
      return kopie;
    });
  }

  var STIJL = "" +
    ".bspec{font-size:13.5px;line-height:1.4}" +
    ".bspec h4{margin:10px 0 4px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted,#7E8A82);font-weight:600}" +
    ".bspec .bs-post{padding:6px 0;border-bottom:1px solid var(--line-soft,#EEE)}" +
    ".bspec .bs-post:last-child{border-bottom:0}" +
    ".bspec .bs-rij{display:flex;justify-content:space-between;gap:10px;align-items:baseline}" +
    ".bspec .bs-groep{display:block;font-size:11.5px;color:var(--muted,#7E8A82)}" +
    ".bspec .bs-bedrag{white-space:nowrap;font-weight:600}" +
    ".bspec .bs-hoe{display:flex;flex-wrap:wrap;gap:4px 6px;margin-top:3px}" +
    ".bspec .bs-chip{display:inline-block;font-size:12px;padding:1px 8px;border-radius:999px;background:#E6F2EA;color:#1F5B41}" +
    ".bspec .bs-chip.open{background:#FBEAE7;color:#B3261E}" +
    ".bspec .bs-chip.grijs{background:var(--surface-2,#F4F1EC);color:var(--ink-2,#46514A)}" +
    ".bspec .bs-bet{display:grid;grid-template-columns:auto 1fr auto;gap:2px 10px;padding:5px 0;border-bottom:1px solid var(--line-soft,#EEE);align-items:baseline}" +
    ".bspec .bs-bet:last-child{border-bottom:0}" +
    ".bspec .bs-bet .d{color:var(--muted,#7E8A82);font-size:12px;min-width:38px}" +
    ".bspec .bs-bet .x{grid-column:2/4;font-size:12px;color:var(--muted,#7E8A82)}" +
    ".bspec .bs-let{margin-top:6px;font-size:12px;color:#B3261E}" +
    "@media (prefers-color-scheme:dark){.bspec .bs-chip{background:#1F3A2C;color:#BFE3CC}.bspec .bs-chip.open{background:#3A1F1C;color:#F2B8B0}}";

  function zorgVoorStijl() {
    if (typeof document === "undefined" || document.getElementById("bspec-stijl")) return;
    var st = document.createElement("style");
    st.id = "bspec-stijl";
    st.textContent = STIJL;
    document.head.appendChild(st);
  }

  function html(s, opties) {
    zorgVoorStijl();
    opties = opties || {};
    if (!s || (!s.posten.length && !s.betalingen.length && !(s.arrangementenTekst || []).length)) {
      return '<div class="bspec" style="color:var(--muted,#7E8A82)">Er is nog geen bedrag of betaling bekend.</div>';
    }
    var h = '<div class="bspec">';
    if (s.totaal != null) {
      var rij = function (naam, bedrag, vet) {
        return '<div class="bs-rij"><span>' + naam + '</span><span class="bs-bedrag"' +
          (vet ? "" : ' style="font-weight:400"') + ">" + esc(euro(bedrag)) + "</span></div>";
      };
      h += '<div class="bs-post">' +
        rij("Totaal" + (s.servicekosten != null ? " (incl. servicekosten)" : ""), s.totaal, true) +
        (s.servicekosten != null ? rij('<span class="bs-groep" style="display:inline">waarvan servicekosten</span>', s.servicekosten, false) : "") +
        rij("Betaald", Math.max(0, r2(s.totaal - s.open)), false) +
        rij("Nog te betalen", s.open, true) + "</div>";
    }
    if ((s.arrangementenTekst || []).length) {
      h += "<h4>Arrangementen volgens het kanaal</h4>" + '<div class="bs-post">' +
        s.arrangementenTekst.map(function (x) { return "<div>" + esc(x) + "</div>"; }).join("") + "</div>";
    }
    if (s.posten.length) h += "<h4>Waarvoor</h4>";
    s.posten.forEach(function (p) {
      var chips = p.delen.map(function (d) {
        var b = d.betaling;
        return '<span class="bs-chip' + (b.onbekend ? " grijs" : "") + '">' +
          (p.delen.length > 1 || d.bedrag + 0.005 < p.bedrag ? esc(euro(d.bedrag)) + " " : "") +
          esc(wijzeTekst(b)) +
          (b.soort && b.soort !== "eerder" && p.sleutel === "verblijf" ? " · " + esc(SOORT[b.soort].toLowerCase()) : "") +
          (b.tijdstip ? " · " + esc(dag(b.tijdstip)) : "") + "</span>";
      });
      if (p.rest > 0.005) chips.push('<span class="bs-chip open">' +
        (p.delen.length ? esc(euro(p.rest)) + " " : "") + "nog open</span>");
      h += '<div class="bs-post"><div class="bs-rij"><span><span class="bs-groep">' + esc(p.groep) +
        "</span>" + esc(p.naam) + '</span><span class="bs-bedrag">' + esc(euro(p.bedrag)) + "</span></div>" +
        '<div class="bs-hoe">' + chips.join("") + "</div></div>";
    });

    if (s.betalingen.length) {
      h += "<h4>Betalingen</h4>";
      s.betalingen.forEach(function (b) {
        var waarvoor = b.gedekt.map(function (g) {
          return g.post.sleutel === "verblijf" ? "verblijf" : g.post.naam;
        });
        var extra = [];
        if (waarvoor.length) extra.push("voor " + waarvoor.join(", "));
        if (b.door) extra.push(b.door);
        if (b.notitie) extra.push(b.notitie);
        if (b.onbekend) extra.push("betaalwijze niet vastgelegd");
        if (b.bron === "eerder" && !b.onbekend) extra.push("volgens de boeking");
        h += '<div class="bs-bet"><span class="d">' + esc(dag(b.tijdstip) || "—") + "</span>" +
          "<span><b>" + esc(SOORT[b.soort] || "Betaling") + "</b> · " + esc(wijzeTekst(b)) + "</span>" +
          '<span class="bs-bedrag">' + esc(euro(b.bedrag)) + "</span>" +
          (extra.length ? '<span class="x">' + esc(extra.join(" · ")) + "</span>" : "") + "</div>";
      });
    }
    if (!s.klopt && opties.waarschuw !== false) {
      h += '<div class="bs-let">Volgens de boeking staat er ' + esc(euro(s.open)) +
        " open, volgens de posten hierboven " + esc(euro(s.openPosten)) +
        ". Kijk het totaalbedrag even na.</div>";
    }
    return h + "</div>";
  }

  global.BWFBetaalSpec = {
    bereken: bereken, html: html, samenvatting: samenvatting,
    nieuweBetaling: nieuweBetaling, merkBetaald: merkBetaald, SOORT: SOORT
  };
})(typeof window !== "undefined" ? window : this);
