(function () {
  "use strict";

  var FUNCTION_URL =
    "https://iuyjvtlauktnjprbmbjj.supabase.co/functions/v1/gastlink-bridge";

  function tokenUitOpslag() {
    try {
      for (
        var i = 0;
        i < localStorage.length;
        i++
      ) {
        var sleutel =
          localStorage.key(i) || "";

        var waarde = JSON.parse(
          localStorage.getItem(sleutel) ||
          "null"
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
        "Supabase-sessie lezen mislukt:",
        error
      );
    }

    return "";
  }

  async function verwerkAntwoord(response) {
    var data = await response
      .json()
      .catch(function () {
        return {};
      });

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Gastenlink-opdracht mislukte (" +
gang>
ibele
        response.status +
        ")."
 fra?
     BEL
