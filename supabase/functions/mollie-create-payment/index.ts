// Supabase Edge Function: mollie-create-payment
//
// Maakt een Mollie-betaallink voor een reservering. Aangeroepen vanuit de
// welkomstcall in vr2.html. De reservering gaat mee in de metadata, zodat de
// webhook de betaling aan de juiste boeking kan hangen.
//
// Secrets (namen, geen waarden): MOLLIE_API_KEY.
// "Verify JWT" moet in Supabase ingeschakeld blijven.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const DASHBOARD_ORIGIN = "https://bwfcheckin.github.io";
const DASHBOARD_URL =
  "https://bwfcheckin.github.io/bwf-incheck/vr2.html";

const WEBHOOK_URL =
  "https://iuyjvtlauktnjprbmbjj.supabase.co/functions/v1/mollie-webhook";

const corsHeaders = {
  "Access-Control-Allow-Origin": DASHBOARD_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOORTEN = ["restant", "extras", "tijd", "gemengd"];

function antwoord(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: corsHeaders,
  });
}

export default {
  async fetch(req: Request) {
    // Nodig voor aanvragen vanuit het dashboard.
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (req.method !== "POST") {
      return antwoord(
        { error: "Alleen POST-aanvragen zijn toegestaan." },
        405,
      );
    }

    // Verify JWT moet in Supabase ingeschakeld blijven.
    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return antwoord(
        { error: "Je bent niet ingelogd in het dashboard." },
        401,
      );
    }

    const mollieKey = Deno.env.get("MOLLIE_API_KEY");

    if (!mollieKey) {
      console.error("MOLLIE_API_KEY ontbreekt");

      return antwoord(
        { error: "Mollie is nog niet volledig ingesteld." },
        500,
      );
    }

    try {
      let invoer: Record<string, unknown>;

      try {
        invoer = await req.json();
      } catch {
        return antwoord(
          { error: "De aangeleverde gegevens zijn ongeldig." },
          400,
        );
      }

      const bedrag = Number(invoer.bedrag);

      const omschrijving = String(
        invoer.omschrijving || "Bed & Wellness Flevoland",
      ).trim();

      // Vrije tekst: het kanaalnummer of kenmerk zoals de gast het kent.
      const reservering = String(
        invoer.reservering || "",
      ).trim();

      const gast = String(
        invoer.gast || "",
      ).trim();

      // Vaste koppelingen. Alleen doorgeven als het echt een uuid is.
      const reserveringId = String(invoer.reservering_id || "").trim();
      const welkomstcallId = String(invoer.welkomstcall_id || "").trim();
      const soort = String(invoer.soort || "").trim();

      if (reserveringId && !UUID.test(reserveringId)) {
        return antwoord(
          { error: "Het reserveringskenmerk is ongeldig." },
          400,
        );
      }

      if (welkomstcallId && !UUID.test(welkomstcallId)) {
        return antwoord(
          { error: "Het kenmerk van de welkomstcall is ongeldig." },
          400,
        );
      }

      if (soort && !SOORTEN.includes(soort)) {
        return antwoord(
          { error: "Onbekend soort betaling." },
          400,
        );
      }

      if (!Number.isFinite(bedrag) || bedrag < 0.01) {
        return antwoord(
          { error: "Vul een geldig bedrag vanaf € 0,01 in." },
          400,
        );
      }

      if (bedrag > 999999.99) {
        return antwoord(
          { error: "Het bedrag is te hoog." },
          400,
        );
      }

      if (!omschrijving) {
        return antwoord(
          { error: "Vul een omschrijving in." },
          400,
        );
      }

      if (omschrijving.length > 255) {
        return antwoord(
          { error: "De omschrijving mag maximaal 255 tekens bevatten." },
          400,
        );
      }

      const molliePayload = {
        amount: {
          currency: "EUR",
          value: bedrag.toFixed(2),
        },

        description: omschrijving,

        redirectUrl: reservering
          ? `${DASHBOARD_URL}?betaling=${encodeURIComponent(reservering)}`
          : DASHBOARD_URL,

        webhookUrl: WEBHOOK_URL,

        metadata: {
          reservering: reservering || null,
          reservering_id: reserveringId || null,
          welkomstcall_id: welkomstcallId || null,
          soort: soort || null,
          gast: gast || null,
          aangemaakt_via: "BWF Virtual Assistent Dashboard",
        },
      };

      const mollieResponse = await fetch(
        "https://api.mollie.com/v2/payments",
        {
          method: "POST",

          headers: {
            Authorization: `Bearer ${mollieKey}`,
            "Content-Type": "application/json",
            // Zelfde reservering, zelfde soort en zelfde bedrag binnen een uur
            // levert dezelfde betaling op in plaats van een tweede link.
            "Idempotency-Key": reserveringId
              ? `bwf-${reserveringId}-${soort || "los"}-${bedrag.toFixed(2)}-${
                new Date().toISOString().slice(0, 13)
              }`
              : crypto.randomUUID(),
          },

          body: JSON.stringify(molliePayload),
        },
      );

      const mollieData = await mollieResponse.json();

      if (!mollieResponse.ok) {
        console.error(
          "Mollie-fout:",
          mollieResponse.status,
          mollieData,
        );

        return antwoord(
          {
            error:
              mollieData?.detail ||
              mollieData?.title ||
              "Mollie kon de betaling niet aanmaken.",
          },
          mollieResponse.status,
        );
      }

      const checkoutUrl =
        mollieData?._links?.checkout?.href;

      if (!checkoutUrl) {
        console.error(
          "Geen checkoutlink ontvangen:",
          mollieData,
        );

        return antwoord(
          { error: "Mollie heeft geen betaallink teruggestuurd." },
          502,
        );
      }

      return antwoord({
        success: true,
        paymentId: mollieData.id,
        status: mollieData.status,
        checkoutUrl,
        bedrag: mollieData.amount,
        omschrijving: mollieData.description,
        mode: mollieData.mode,
      });
    } catch (error) {
      console.error("Onverwachte fout:", error);

      return antwoord(
        {
          error:
            "Er is een onverwachte fout opgetreden bij het maken van de betaallink.",
        },
        500,
      );
    }
  },
};
