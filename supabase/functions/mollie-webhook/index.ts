// Supabase Edge Function: mollie-webhook
//
// Mollie meldt hier elke statuswijziging van een betaling. De betaling wordt
// altijd opnieuw bij Mollie opgehaald (de melding zelf wordt niet vertrouwd) en
// daarna opgeslagen in mollie_betalingen — voortaan met de reservering en de
// welkomstcall waar de betaling bij hoort.
//
// Secrets (namen, geen waarden): MOLLIE_API_KEY, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY (of SUPABASE_SECRET_KEYS).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

console.info("Mollie-webhook gestart");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonAntwoord(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function uuidOfNiets(waarde: unknown): string | null {
  const t = String(waarde || "").trim();
  return UUID.test(t) ? t : null;
}

function haalSupabaseSecretOp(): string | null {
  // Ondersteuning voor de bestaande en nieuwe Supabase-secretindeling.
  const oudeKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (oudeKey) {
    return oudeKey;
  }

  const nieuweKeys = Deno.env.get("SUPABASE_SECRET_KEYS");

  if (!nieuweKeys) {
    return null;
  }

  try {
    const keys = JSON.parse(nieuweKeys);
    return keys.default || Object.values(keys)[0] || null;
  } catch {
    return null;
  }
}

export default {
  async fetch(req: Request) {
    if (req.method !== "POST") {
      return jsonAntwoord(
        { error: "Alleen POST-aanvragen zijn toegestaan." },
        405,
      );
    }

    const mollieKey = Deno.env.get("MOLLIE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseSecret = haalSupabaseSecretOp();

    if (!mollieKey) {
      console.error("MOLLIE_API_KEY ontbreekt");
      return jsonAntwoord({ error: "Mollie-key ontbreekt." }, 500);
    }

    if (!supabaseUrl || !supabaseSecret) {
      console.error("Supabase-servergegevens ontbreken");
      return jsonAntwoord(
        { error: "Supabase-servergegevens ontbreken." },
        500,
      );
    }

    try {
      /*
       * De Payments API van Mollie stuurt normaal gesproken:
       * Content-Type: application/x-www-form-urlencoded
       * met daarin bijvoorbeeld id=tr_xxxxx.
       */
      const contentType =
        req.headers.get("content-type")?.toLowerCase() || "";

      let paymentId = "";

      if (contentType.includes("application/json")) {
        const body = await req.json();
        paymentId = String(body.id || "").trim();
      } else {
        const formulier = await req.formData();
        paymentId = String(formulier.get("id") || "").trim();
      }

      if (!/^tr_[A-Za-z0-9]+$/.test(paymentId)) {
        return jsonAntwoord(
          { error: "Ongeldig Mollie-betalingsnummer." },
          400,
        );
      }

      /*
       * Vertrouw niet alleen op de webhookgegevens.
       * Vraag de actuele betaling rechtstreeks bij Mollie op.
       */
      const mollieResponse = await fetch(
        `https://api.mollie.com/v2/payments/${encodeURIComponent(paymentId)}`,
        {
          headers: {
            Authorization: `Bearer ${mollieKey}`,
            Accept: "application/json",
          },
        },
      );

      const betaling = await mollieResponse.json();

      if (!mollieResponse.ok) {
        console.error(
          "Betaling kon niet bij Mollie worden opgehaald:",
          mollieResponse.status,
          betaling,
        );

        return jsonAntwoord(
          { error: "Betaling kon niet worden gecontroleerd." },
          502,
        );
      }

      const supabase = createClient(
        supabaseUrl,
        supabaseSecret,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        },
      );

      const metadata =
        betaling.metadata &&
        typeof betaling.metadata === "object"
          ? betaling.metadata
          : {};

      const record = {
        mollie_id: betaling.id,
        status: betaling.status,
        mode: betaling.mode,
        bedrag: Number(betaling.amount?.value || 0),
        valuta: betaling.amount?.currency || "EUR",
        omschrijving: betaling.description || null,
        reservering: metadata.reservering || null,
        reservering_id: uuidOfNiets(metadata.reservering_id),
        welkomstcall_id: uuidOfNiets(metadata.welkomstcall_id),
        soort: metadata.soort || null,
        gast: metadata.gast || null,
        checkout_url: betaling._links?.checkout?.href || null,
        betaald_op: betaling.paidAt || null,
        verlopen_op: betaling.expiresAt || null,
        mollie_aangemaakt_op: betaling.createdAt || null,
        bijgewerkt_op: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("mollie_betalingen")
        .upsert(record, {
          onConflict: "mollie_id",
        });

      if (error) {
        console.error("Betaling opslaan mislukt:", error);

        return jsonAntwoord(
          { error: "De betaalstatus kon niet worden opgeslagen." },
          500,
        );
      }

      console.info(
        `Mollie-betaling ${betaling.id} bijgewerkt naar ${betaling.status}`,
      );

      return jsonAntwoord({
        success: true,
        paymentId: betaling.id,
        status: betaling.status,
      });
    } catch (error) {
      console.error("Onverwachte webhookfout:", error);

      return jsonAntwoord(
        { error: "De Mollie-webhook kon niet worden verwerkt." },
        500,
      );
    }
  },
};
