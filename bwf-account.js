/* =========================================================
   bwf-account.js — persoonlijke begroeting en wachtwoordherstel

   Zet onderaan de <body> van een pagina:
     <script src="bwf-account.js?v=1"></script>

   Begroeting: staat er een element met id="bwfGroet", dan wordt die gevuld
   met "Goedemiddag Kelly · donderdag 10 september". Staat het er niet, dan
   gebeurt er niets — geen ongevraagde balken in beeld.

   Herstel: window.BWFaccount.herstel(email) stuurt een herstelmail. Een knop
   of link met id="bwfVergeten" wordt automatisch aangesloten en pakt het
   e-mailadres uit het invoerveld ernaast.
   ========================================================= */
(function () {
  "use strict";

  var PROJECT = "iuyjvtlauktnjprbmbjj";
  var BASIS   = "https://" + PROJECT + ".supabase.co";
  var ANON    = "sb_publishable_SfQjQTwKa3BgCtjwE-8ljw_mTpqEY3U";
  var SLEUTEL = "sb-" + PROJECT + "-auth-token";

  function sessie() {
    try {
      var s = JSON.parse(localStorage.getItem(SLEUTEL) || "null");
      if (!s || !s.access_token) return null;
      var deel = JSON.parse(atob(s.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (deel.exp && deel.exp * 1000 < Date.now()) return null;
      return { token: s.access_token, email: deel.email || "" };
    } catch (e) { return null; }
  }

  function dagdeel() {
    var u = new Date().getHours();
    return u < 6 ? "Goedenacht" : u < 12 ? "Goedemorgen" : u < 18 ? "Goedemiddag" : "Goedenavond";
  }
  function vandaagTekst() {
    return new Date().toLocaleDateString("nl-NL",
      { weekday: "long", day: "numeric", month: "long" });
  }

  async function naamVan(s) {
    if (!s || !s.email) return "";
    try {
      var r = await fetch(BASIS + "/rest/v1/wz_medewerkers?select=naam&email=eq." +
        encodeURIComponent(s.email), {
        headers: { apikey: ANON, Authorization: "Bearer " + s.token }
      });
      if (!r.ok) return "";
      var rijen = await r.json();
      return (rijen && rijen[0] && rijen[0].naam) ? String(rijen[0].naam).split(" ")[0] : "";
    } catch (e) { return ""; }
  }

  async function begroeting() {
    var vak = document.getElementById("bwfGroet");
    if (!vak) return;
    var s = sessie();
    /* eerst de dag, dan pas de naam: dan staat er nooit lang niets */
    vak.textContent = dagdeel() + " \u00b7 " + vandaagTekst();
    var naam = await naamVan(s);
    if (naam) vak.textContent = dagdeel() + " " + naam + " \u00b7 " + vandaagTekst();
  }

  /* ---------- herstelmail sturen ---------- */
  async function herstel(email) {
    if (!email || email.indexOf("@") < 0) throw new Error("Vul eerst je e-mailadres in.");
    var terug = location.href.replace(/[^/]*$/, "") + "wachtwoord.html";
    var r = await fetch(BASIS + "/auth/v1/recover?redirect_to=" + encodeURIComponent(terug), {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email: email })
    });
    /* Supabase antwoordt bewust hetzelfde of het adres nu bestaat of niet.
       Dat is met opzet: zo kan niemand uitvissen wie er een account heeft. */
    if (!r.ok && r.status !== 200) {
      var d = await r.json().catch(function () { return {}; });
      throw new Error(d.msg || d.error_description || "Versturen lukte niet.");
    }
    return true;
  }

  function sluitVergetenAan() {
    var knop = document.getElementById("bwfVergeten");
    if (!knop || knop.dataset.aan) return;
    knop.dataset.aan = "1";
    knop.addEventListener("click", async function (e) {
      e.preventDefault();
      var veld = document.querySelector('input[type="email"]');
      var mail = veld ? veld.value.trim() : "";
      if (!mail) { mail = prompt("Naar welk e-mailadres sturen we de herstelmail?") || ""; }
      var oud = knop.textContent;
      knop.textContent = "Bezig\u2026";
      try {
        await herstel(mail.trim());
        knop.textContent = "Mail verstuurd";
        alert("Als dit adres bij ons bekend is, staat er zo een mail in de inbox met een link " +
              "om een nieuw wachtwoord in te stellen. Kijk ook even in de map ongewenste mail.");
      } catch (err) {
        alert(err.message);
        knop.textContent = oud;
      }
      setTimeout(function () { knop.textContent = oud; }, 6000);
    });
  }

  function start() { begroeting(); sluitVergetenAan(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  window.BWFaccount = {
    herstel: herstel,
    begroeting: begroeting,
    wijzigen: function () { location.href = "wachtwoord.html"; }
  };
})();
