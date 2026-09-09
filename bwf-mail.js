(function () {
  "use strict";

  var FUNCTION_URL =
    "https://iuyjvtlauktnjprbmbjj.supabase.co/functions/v1/mail-bridge";

  function tokenUitOpslag() {
    try {
      for (
        var i = 0;
        i < localStorage.length;
        i++
      ) {
        var waarde = JSON.parse(
          localStorage.getItem(
            localStorage.key(i)
          ) || "null"
        );

        var sessie = Array.isArray(waarde)
          ? waarde[0]
          : waarde;

        var token =
          sessie &&
          (
            sessie.access_token ||
            sessie.token
          );

        if (
          token &&
          String(token).split(".").length === 3
        ) {
          return token;
        }
      }
    } catch (error) {
      console.error(
        "Inlogsessie lezen mislukt:",
        error
      );
    }

    return "";
  }

  window.BWFMail = {
    send: async function (
      type,
      ontvanger,
      gegevens
    ) {
      var token = tokenUitOpslag();

      if (!token) {
        throw new Error(
          "Log eerst opnieuw in."
        );
      }

      var response = await fetch(
        FUNCTION_URL,
        {
          method: "POST",
          headers: {
            Authorization:
              "Bearer " + token,
            "Content-Type":
              "application/json",
            Accept:
              "application/json"
          },
          body: JSON.stringify({
            type: type,
            to: ontvanger,
            data: gegevens || {}
          })
        }
      );

      var data = await response
        .json()
        .catch(function () {
          return {};
        });

      if (!response.ok) {
        throw new Error(
          data.error ||
          "E-mail verzenden mislukte (" +
          response.status +
          ")."
        );
      }

      return data;
    },

    functionUrl: FUNCTION_URL
  };
})();
