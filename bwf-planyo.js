/* BWF Planyo-client — de geheime Planyo-sleutel staat uitsluitend in de Edge Function. */
(function () {
  "use strict";

  var PROJECT = "iuyjvtlauktnjprbmbjj";
  var FUNCTION_URL =
    "https://" + PROJECT + ".supabase.co/functions/v1/planyo-bridge";

  var accessToken = "";

  function tokenUitOpslag() {
    if (accessToken) return accessToken;

    if (window.BWF && window.BWF.token) {
      var token = window.BWF.token();
      if (token) return token;
    }

    try {
      for (var i = 0; i < localStorage.length; i++) {
        var sleutel = localStorage.key(i) || "";

        if (
          sleutel.indexOf("sb-") !== 0 ||
          sleutel.indexOf("-auth-token") < 0
        ) {
          continue;
        }

        var waarde = JSON.parse(
          localStorage.getItem(sleutel) || "null"
        );

        var sessie = Array.isArray(waarde)
          ? waarde[0]
          : waarde;

        if (sessie && sessie.access_token) {
          return sessie.access_token;
        }
      }
    } catch (fout) {
      console.warn("Supabase-sessie kon niet worden gelezen.", fout);
    }

    return "";
  }

  async function verzoek(actie, parameters) {
    var token = tokenUitOpslag();

    if (!token) {
      throw new Error(
        "Log eerst in om de Planyo-agenda te gebruiken."
      );
    }

    var url = new URL(FUNCTION_URL);
    url.searchParams.set("action", actie);

    Object.keys(parameters || {}).forEach(function (naam) {
      if (
        parameters[naam] !== null &&
        parameters[naam] !== undefined &&
        parameters[naam] !== ""
      ) {
        url.searchParams.set(
          naam,
          String(parameters[naam])
        );
      }
    });

    var antwoord = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/json"
      }
    });

    var data = await antwoord.json().catch(function () {
      return {};
    });

    if (!antwoord.ok) {
      throw new Error(
        data.error ||
        "Planyo kon niet worden geladen (" +
        antwoord.status +
        ")."
      );
    }

    return data;
  }

  async function verstuur(actie, gegevens) {
    var token = tokenUitOpslag();

    if (!token) {
      throw new Error(
        "Log eerst in om Planyo te gebruiken."
      );
    }

    var antwoord = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(
        Object.assign(
          { action: actie },
          gegevens || {}
        )
      )
    });

    var data = await antwoord.json().catch(function () {
      return {};
    });

    if (!antwoord.ok) {
      throw new Error(
        data.error ||
        "Planyo-opdracht mislukte (" +
        antwoord.status +
        ")."
      );
    }

    return data;
  }

  window.BWFPlanyo = {
    setAccessToken: function (token) {
      accessToken = token || "";
    },

    reservations: function (van, tot) {
      return verzoek("reservations", {
        from: van,
        to: tot
      });
    },

    customers: function (pagina) {
      return verzoek("customers", {
        page: pagina || 0
      });
    },

    resources: function () {
      return verzoek("resources", {});
    },

    createReservation: function (gegevens) {
      return verstuur(
        "create-reservation",
        gegevens
      );
    },

    createBlock: function (gegevens) {
      return verstuur(
        "create-block",
        gegevens
      );
    },

    createPayment: function (gegevens) {
      return verstuur(
        "create-payment",
        gegevens
      );
    },

    paymentStatus: function (paymentId) {
      return verstuur(
        "payment-status",
        {
          payment_id: paymentId
        }
      );
    },

    functionUrl: FUNCTION_URL
  };
})();
