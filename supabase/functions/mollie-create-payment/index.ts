// Supabase Edge Function: mollie-create-payment
//
// Maakt een Mollie-betaallink voor een reservering met de Payment Links API
// (POST /v2/payment-links). Aangeroepen vanuit reserveringen.html en vanuit de
// welkomstcall in vr2.html.
//
// Waarom Payment Links en niet meer de Payments API (Angela, 20-09-2026):
// een payment link is een link die je stuurt, niet een betaling die al loopt.
// Hij verloopt netjes na 48 uur en de gast kiest zelf zijn betaalmethode.
//
// LET OP - het grote verschil: de Payment Links API accepteert GEEN metadata.
// Nagekeken in de documentatie op 20-09-2026: het verzoek kent amount,
// description, redirectUrl, webhookUrl, expiresAt, reusable, allowedMethods,
// lines en adressen, maar geen metadata. En het betalingsobject bevat geen
// verwijzing terug naar de link. De koppeling aan een boeking loopt daarom via
// de database: deze functie schrijft het link-id en de link zelf weg bij de
// reservering, en de webhook zoekt daarop. Dat gebeurt hier en niet in het
// scherm, zodat er geen moment bestaat waarop de link bij Mollie leeft maar
// nergens is vastgelegd.
//
// Secrets (namen, geen waarden): MOLLIE_API_KEY, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY (of SUPABASE_SECRET_KEYS).
// "Verify JWT" moet in Supabase ingeschakeld blijven.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const DASHBOARD_ORIGIN = "https://bwfcheckin.github.io";

// Openbare bedankpagina. Bewust niet het dashboard: daar hoort een gast niet
// te komen, en hij kan er toch niet in zonder account.
const BEDANKT_URL =
  "https://bwfcheckin.github.io/bwf-incheck/betaald.html";

const WEBHOOK_URL =
  "https://iuyjvtlauktnjprbmbjj.supabase.co/functions/v1/mollie-webhook";

// Hoe lang een betaallink geldig blijft.
const GELDIG_UREN = 48;

const corsHeaders = {
  "Access-Control-Allow-Origin": DASHBOARD_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOORTEN = ["restant", "extras", "tijd", "gemengd"];

function antwoord(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

function haalSupabaseSecretOp(): string | null {
  // Ondersteuning voor de bestaande en nieuwe Supabase-secretindeling.
  const oudeKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (oudeKey) return oudeKey;

  const nieuweKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!nieuweKeys) return null;

  try {
    const keys = JSON.parse(nieuweKeys);
    return keys.default || Object.values(keys)[0] || null;
  } catch {
    return null;
  }
}

export default {
  async fetch(req: Request) {
    // Nodig voor aanvragen vanuit het dashboard.
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
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

      // Vrije tekst: het kanaalnummer of kenmerk zoals de gast het kent.
      const reservering = String(invoer.reservering || "").trim();
      const gast = String(invoer.gast || "").trim();

      // Vaste koppelingen. Alleen doorgeven als het echt een uuid is.
      const reserveringId = String(invoer.reservering_id || "").trim();
      const welkomstcallId = String(invoer.welkomstcall_id || "").trim();
      const soort = String(invoer.soort || "").trim();

      /*
       * De omschrijving is wat de gast op zijn bankafschrift ziet én waaraan
       * Angela de betaling herkent: reserveringsnummer plus naam. Geeft het
       * scherm zelf een omschrijving mee, dan heeft die voorrang.
       */
      const opgegeven = String(invoer.omschrijving || "").trim();
      const omschrijving =
        (opgegeven ||
          [reservering, gast].filter(Boolean).join(" · ") ||
          "Bed & Wellness Flevoland").slice(0, 255);

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
        return antwoord({ error: "Onbekend soort betaling." }, 400);
      }

      if (!Number.isFinite(bedrag) || bedrag < 0.01) {
        return antwoord(
          { error: "Vul een geldig bedrag vanaf € 0,01 in." },
          400,
        );
      }

      if (bedrag > 999999.99) {
        return antwoord({ error: "Het bedrag is te hoog." }, 400);
      }

      if (!omschrijving) {
        return antwoord({ error: "Vul een omschrijving in." }, 400);
      }

      // Aanmaakmoment plus 48 uur, in ISO 8601 zoals Mollie verwacht.
      const aangemaaktOp = new Date();
      const verlooptOp = new Date(
        aangemaaktOp.getTime() + GELDIG_UREN * 60 * 60 * 1000,
      );

      const molliePayload = {
        amount: {
          currency: "EUR",
          value: bedrag.toFixed(2),
        },

        description: omschrijving,

        // Openbare bedankpagina, niet het dashboard.
        redirectUrl: BEDANKT_URL,

        webhookUrl: WEBHOOK_URL,

        expiresAt: verlooptOp.toISOString(),
      };

      const mollieResponse = await fetch(
        "https://api.mollie.com/v2/payment-links",
        {
          method: "POST",

          headers: {
            Authorization: `Bearer ${mollieKey}`,
            "Content-Type": "application/json",
            // Zelfde reservering, zelfde soort en zelfde bedrag binnen een uur
            // levert dezelfde link op in plaats van een tweede.
            "Idempotency-Key": reserveringId
              ? `bwf-pl-${reserveringId}-${soort || "los"}-${bedrag.toFixed(2)}-${
                aangemaaktOp.toISOString().slice(0, 13)
              }`
              : crypto.randomUUID(),
          },

          body: JSON.stringify(molliePayload),
        },
      );

      const mollieData = await mollieResponse.json();

      if (!mollieResponse.ok) {
        console.error("Mollie-fout:", mollieResponse.status, mollieData);

        return antwoord(
          {
            error: mollieData?.detail ||
              mollieData?.title ||
              "Mollie kon de betaallink niet aanmaken.",
          },
          mollieResponse.status,
        );
      }

      /*
       * De Payment Links API geeft de link terug als _links.paymentLink.href.
       * Dat is een ander veld dan de Payments API, die _links.checkout.href
       * gebruikt. Beide worden hier gelezen, zodat een antwoord in de oude
       * vorm niet stilletjes leeg blijft.
       */
      const betaalUrl = mollieData?._links?.paymentLink?.href ||
        mollieData?._links?.checkout?.href ||
        null;

      const linkId = String(mollieData?.id || "");

      if (!betaalUrl || !linkId) {
        console.error("Geen betaallink ontvangen:", mollieData);

        return antwoord(
          { error: "Mollie heeft geen betaallink teruggestuurd." },
          502,
        );
      }

      /*
       * Vastleggen bij de reservering. Dit is de enige draad terug: de webhook
       * krijgt straks alleen het link-id (pl_...) en zoekt daarmee de boeking.
       * Zonder deze stap komt een betaling nooit bij de juiste reservering aan.
       */
      let gekoppeld = false;
      let koppelFout = "";

      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseSecret = haalSupabaseSecretOp();

      if (reserveringId && supabaseUrl && supabaseSecret) {
        try {
          const supabase = createClient(supabaseUrl, supabaseSecret, {
            auth: { persistSession: false, autoRefreshToken: false },
          });

          const { error: resFout } = await supabase
            .from("reserveringen")
            .update({
              betaallink_id: linkId,
              betaallink_url: betaalUrl,
              betaallink_verloopt: verlooptOp.toISOString(),
            })
            .eq("id", reserveringId);

          if (resFout) throw resFout;

          /*
           * En meteen een regel in mollie_betalingen, zodat de link ook zonder
           * webhook al zichtbaar is in de schermen. De webhook werkt deze rij
           * later bij met de echte status.
           */
          const { error: betFout } = await supabase
            .from("mollie_betalingen")
            .upsert({
              mollie_id: linkId,
              kenmerk_soort: "payment-link",
              status: mollieData.status || "open",
              mode: mollieData.mode || null,
              bedrag: bedrag,
              valuta: "EUR",
              omschrijving: omschrijving,
              reservering: reservering || null,
              reservering_id: reserveringId,
              welkomstcall_id: welkomstcallId || null,
              soort: soort || null,
              gast: gast || null,
              checkout_url: betaalUrl,
              verlopen_op: verlooptOp.toISOString(),
              mollie_aangemaakt_op: mollieData.createdAt ||
                aangemaaktOp.toISOString(),
              bijgewerkt_op: new Date().toISOString(),
            }, { onConflict: "mollie_id" });

          if (betFout) throw betFout;

          gekoppeld = true;
        } catch (fout) {
          // De link bestaat wel bij Mollie. Dat mag niet stil blijven: zonder
          // koppeling kan de webhook de betaling niet thuisbrengen.
          console.error("Betaallink vastleggen mislukt:", fout);
          koppelFout = String((fout as { message?: string })?.message || fout);
        }
      }

      return antwoord({
        success: true,
        paymentLinkId: linkId,
        // De oude naam blijft staan zodat bestaande schermen blijven werken.
        paymentId: linkId,
        status: mollieData.status || "open",
        checkoutUrl: betaalUrl,
        betaalUrl,
        verlooptOp: verlooptOp.toISOString(),
        bedrag: mollieData.amount,
        omschrijving: mollieData.description,
        mode: mollieData.mode,
        gekoppeld,
        waarschuwing: gekoppeld || !reserveringId ? undefined : (
          "De link is aangemaakt, maar kon niet aan de reservering worden " +
          "vastgelegd" + (koppelFout ? " (" + koppelFout + ")" : "") +
          ". Een betaling wordt dan niet automatisch verwerkt."
        ),
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
