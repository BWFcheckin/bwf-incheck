/* BWF uitbreiding: eigen tijden en een Planyo-blokkade aanmaken. */
(function () {
  "use strict";

  var RESOURCE_ID = {
    angie: "254072",
    jacuzzi: "254073",
    zwembad: "254076"
  };

  function el(id) {
    return document.getElementById(id);
  }

  function toonMelding(tekst, gelukt) {
    if (typeof msg === "function") {
      msg(tekst, Boolean(gelukt));
    } else {
      alert(tekst);
    }
  }

  function voegPaneelToe() {
    var slots = el("slots");

    if (!slots || el("bwfEigenPaneel")) {
      return;
    }

    var paneel = document.createElement("div");

    paneel.id = "bwfEigenPaneel";
    paneel.className = "wide";
    paneel.style.cssText =
      "margin-top:12px;" +
      "padding:14px;" +
      "border:1px dashed #cdbda9;" +
      "border-radius:12px;" +
      "background:#faf7f3;";

    paneel.innerHTML =
      '<span class="label">Eigen tijd of blokkade</span>' +

      '<div class="fields">' +

        "<div>" +
          "<label>Begintijd</label>" +
          '<input id="bwfEigenVan" type="time" value="12:00">' +
        "</div>" +

        "<div>" +
          "<label>Eindtijd</label>" +
          '<input id="bwfEigenTot" type="time" value="18:00">' +
        "</div>" +

        "<div>" +
          "<label>Eigen prijs</label>" +
          '<input id="bwfEigenPrijs" type="number" min="0" step="0.01" value="0">' +
        "</div>" +

        "<div>" +
          "<label>Omschrijving / reden</label>" +
          '<input id="bwfEigenReden" value="Niet beschikbaar">' +
        "</div>" +

      "</div>" +

      '<div class="actions">' +
        '<button id="bwfKiesEigen" class="btn" type="button">' +
          "Eigen tijd gebruiken" +
        "</button>" +

        '<button id="bwfMaakBlok" class="btn danger" type="button">' +
          "Niet beschikbaar blokkeren" +
        "</button>" +
      "</div>" +

      '<p class="hint">' +
        "Eigen tijd wordt gebruikt voor een normale reservering. " +
        "Een blokkade bevat geen gast, betaling of bevestiging." +
      "</p>";

    slots.parentNode.appendChild(paneel);

    el("bwfKiesEigen").onclick = function () {
      var van = el("bwfEigenVan").value;
      var tot = el("bwfEigenTot").value;
      var prijs = Number(el("bwfEigenPrijs").value || 0);

      if (!van || !tot) {
        toonMelding("Vul een begin- en eindtijd in.");
        return;
      }

      /*
       * De bestaande reserveringspagina gebruikt deze variabelen.
       * Hiermee wordt het eigen tijdsblok geselecteerd.
       */
      slot = [
        van,
        tot,
        prijs,
        "Eigen tijd"
      ];

      slotIndex = -1;

      document
        .querySelectorAll("[data-slot]")
        .forEach(function (vak) {
          vak.classList.remove("on");
        });

      this.classList.add("primary");

      if (el("handprijs")) {
        el("handprijs").value = String(prijs);
      }

      if (typeof bereken === "function") {
        bereken();
      }

      toonMelding(
        "Eigen tijd " + van + "–" + tot + " is geselecteerd.",
        true
      );
    };

    el("bwfMaakBlok").onclick = async function () {
      var suite = el("suite").value;
      var resourceId = RESOURCE_ID[suite];

      var datum = el("datum").value;
      var einddatum =
        el("vertrek").value || datum;

      var van = el("bwfEigenVan").value;
      var tot = el("bwfEigenTot").value;

      var reden =
        el("bwfEigenReden").value.trim() ||
        "Niet beschikbaar";

      if (
        !resourceId ||
        !datum ||
        !einddatum ||
        !van ||
        !tot
      ) {
        toonMelding(
          "Kies een suite, datum en geldige tijden."
        );
        return;
      }

      var begin =
        new Date(datum + "T" + van);

      var einde =
        new Date(einddatum + "T" + tot);

      if (einde <= begin) {
        toonMelding(
          "Het einde van de blokkade moet na het begin liggen."
        );
        return;
      }

      if (
        !window.BWFPlanyo ||
        typeof window.BWFPlanyo.createBlock !== "function"
      ) {
        toonMelding(
          "De nieuwe Planyo-blokkadefunctie is nog niet geladen."
        );
        return;
      }

      var bevestiging = confirm(
        "Deze suite niet boekbaar maken van " +
        datum +
        " " +
        van +
        " tot " +
        einddatum +
        " " +
        tot +
        "?"
      );

      if (!bevestiging) {
        return;
      }

      var knop = this;

      knop.disabled = true;
      knop.textContent = "Blokkeren…";

      try {
        var resultaat =
          await window.BWFPlanyo.createBlock({
            resource_id: resourceId,
            start_time: datum + " " + van,
            end_time: einddatum + " " + tot,
            reason: reden
          });

        var nummer = "";

        if (resultaat.block_id) {
          nummer = "#" + resultaat.block_id + " ";
        }

        toonMelding(
          "Blokkade " +
          nummer +
          "is in Planyo aangemaakt.",
          true
        );

        knop.textContent = "Blokkade aangemaakt";
      } catch (fout) {
        toonMelding(
          "Blokkade maken mislukte: " +
          fout.message
        );

        knop.disabled = false;
        knop.textContent =
          "Niet beschikbaar blokkeren";
      }
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      voegPaneelToe
    );
  } else {
    voegPaneelToe();
  }
})();
