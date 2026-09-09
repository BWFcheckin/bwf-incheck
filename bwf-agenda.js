/* BWF agenda-client — de geheime Google-agendasleutel staat alleen in Supabase. */
(function () {
  "use strict";

  var PROJECT = "iuyjvtlauktnjprbmbjj";
  var FUNCTION_URL = "https://" + PROJECT + ".supabase.co/functions/v1/agenda-bridge";
  var accessToken = "";

  function tokenUitOpslag() {
    if (accessToken) return accessToken;
    if (window.BWF && window.BWF.token) {
      var t = window.BWF.token();
      if (t) return t;
    }
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var sleutel = localStorage.key(i) || "";
        var waarde = JSON.parse(localStorage.getItem(sleutel) || "null");
        var sessie = Array.isArray(waarde) ? waarde[0] : waarde;
        var kandidaat = sessie && (sessie.access_token || sessie.token);
        if (kandidaat && String(kandidaat).split(".").length === 3) return kandidaat;
      }
    } catch (e) {}
    return "";
  }

  async function events(ververs) {
    var token = tokenUitOpslag();
    if (!token) throw new Error("Log eerst in om de gezamenlijke agenda te laden.");
    var url = new URL(FUNCTION_URL);
    if (ververs) url.searchParams.set("vers", "1");
    var antwoord = await fetch(url.toString(), {
      headers: { Authorization: "Bearer " + token, Accept: "application/json" }
    });
    var data = await antwoord.json().catch(function () { return {}; });
    if (!antwoord.ok) throw new Error(data.error || "Agenda kon niet worden geladen (" + antwoord.status + ").");
    if (data.fout) throw new Error(data.fout);
    return data;
  }

  window.BWFAgenda = {
    setAccessToken: function (token) { accessToken = token || ""; },
    events: events,
    functionUrl: FUNCTION_URL
  };
})();
