// Supabase Edge Function: mollie-webhook
//
// Mollie meldt hier elke statuswijziging. De melding zelf wordt nooit
// vertrouwd: het onderwerp wordt altijd opnieuw bij Mollie opgehaald.
//
// Er komen sinds 20-09-2026 twee soorten meldingen binnen:
//   pl_...  een betaallink (Payment Links API) - het nieuwe soort
//   tr_...  een losse betaling (Payments API)  - de 20 bestaande betalingen
// Beide worden verwerkt. De oude weigerde alles wat niet met tr_ begon, dus
// zonder deze aanpassing zou elke melding van een betaallink stranden op een
// foutmelding.
//
// Is er betaald, dan wordt de reservering bijgewerkt: het betaalde bedrag gaat
// omhoog, het openstaande bedrag omlaag, en de status wordt "betaald" of
// "deels". Dat gebeurt maar één keer per link of betaling - Mollie mag een
// melding namelijk herhalen, en twee keer optellen zou de boeking dubbel
// betaald laten lijken.
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
    headers: { "Content-Type": "application/json" },
  });
}

function uuidOfNiets(waarde: unknown): string | null {
  const t = String(waarde || "").trim();
  return UUID.test(t) ? t : null;
}

function haalSupabaseSecretOp(): string | null {
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

function getal(waarde: unknown): number {
  const n = Number(waarde);
  return Number.isFinite(n) ? n : 0;
}

function afgerond(n: number): number {
  return Math.round(n * 100) / 100;
}

/*
 * De reservering bijwerken na een geslaagde betaling. Alleen aanroepen als de
 * betaling nieuw is; de aanroeper bewaakt dat.
 */
async function zetReserveringBetaald(
  supabase: ReturnType<typeof createClient>,
  reserveringId: string,
  bedrag: number,
  wanneer: string | null,
) {
  const { data, error } = await supabase
    .from("reserveringen")
    .select("id, bedrag_totaal, betaald_bedrag, restant_bedrag, betaalstatus")
    .eq("id", reserveringId)
    .maybeSingle();

  if (error || !data) {
    console.error("Reservering niet gevonden:", reserveringId, error);
    return false;
  }

  const totaal = data.bedrag_totaal != null ? getal(data.bedrag_totaal) : null;
  const betaaldWas = getal(data.betaald_bedrag);

  /*
   * Wat stond er open? Het vastgelegde restant is leidend. Staat dat er niet,
   * dan leiden we het af uit totaal min betaald - net zoals de schermen doen.
   */
  const openWas = data.restant_bedrag != null
    ? getal(data.restant_bedrag)
    : (totaal != null ? Math.max(0, totaal - betaaldWas) : 0);

  const betaaldNu = afgerond(betaaldWas + bedrag);
  const openNu = afgerond(Math.max(0, openWas - bedrag));

  const wijziging: Record<string, unknown> = {
    betaald_bedrag: betaaldNu,
    restant_bedrag: openNu,
    betaalstatus: openNu > 0 ? "deels" : "betaald",
    betaald_via: "Mollie betaallink",
    gewijzigd_door: "Mollie",
  };

  // Was er nog geen totaalbedrag bekend, dan is dit in elk geval betaald.
  if (totaal == null) wijziging.bedrag_totaal = betaaldNu;

  const { error: schrijfFout } = await supabase
    .from("reserveringen")
    .update(wijziging)
    .eq("id", reserveringId);

  if (schrijfFout) {
    console.error("Reservering bijwerken mislukt:", schrijfFout);
    return false;
  }

  console.info(
    `Reservering ${reserveringId} bijgewerkt: betaald ${betaaldNu}, ` +
      `open ${openNu}, status ${wijziging.betaalstatus}` +
      (wanneer ? ` (betaald op ${wanneer})` : ""),
  );

  return true;
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
       * Mollie stuurt Content-Type: application/x-www-form-urlencoded met
       * daarin id=pl_xxx (betaallink) of id=tr_xxx (losse betaling).
       */
      const contentType = req.headers.get("content-type")?.toLowerCase() || "";

      let kenmerk = "";

      if (contentType.includes("application/json")) {
        const body = await req.json();
        kenmerk = String(body.id || "").trim();
      } else {
        const formulier = await req.formData();
        kenmerk = String(formulier.get("id") || "").trim();
      }

      const isLink = /^pl_[A-Za-z0-9]+$/.test(kenmerk);
      const isBetaling = /^tr_[A-Za-z0-9]+$/.test(kenmerk);

      if (!isLink && !isBetaling) {
        return jsonAntwoord(
          { error: "Onbekend Mollie-kenmerk." },
          400,
        );
      }

      const pad = isLink
        ? `https://api.mollie.com/v2/payment-links/${encodeURIComponent(kenmerk)}`
        : `https://api.mollie.com/v2/payments/${encodeURIComponent(kenmerk)}`;

      const mollieResponse = await fetch(pad, {
        headers: {
          Authorization: `Bearer ${mollieKey}`,
          Accept: "application/json",
        },
      });

      const onderwerp = await mollieResponse.json();

      if (!mollieResponse.ok) {
        console.error(
          "Kon niet bij Mollie worden opgehaald:",
          mollieResponse.status,
          onderwerp,
        );

        return jsonAntwoord(
          { error: "De melding kon niet worden gecontroleerd." },
          502,
        );
      }

      const supabase = createClient(supabaseUrl, supabaseSecret, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      /*
       * Wat wisten we al? Nodig om te bepalen of deze betaling nieuw is. Een
       * herhaalde melding mag het bedrag niet nog eens bij de reservering
       * optellen.
       */
      const { data: bekend } = await supabase
        .from("mollie_betalingen")
        .select("mollie_id, status, reservering_id, soort, welkomstcall_id, gast, reservering")
        .eq("mollie_id", kenmerk)
        .maybeSingle();

      const wasAlBetaald = String(bekend?.status || "") === "paid";

      let record: Record<string, unknown>;
      let reserveringId: string | null = null;
      let betaaldOp: string | null = null;
      let isBetaald = false;
      let bedrag = 0;

      if (isLink) {
        /*
         * Een betaallink kent geen metadata - die ondersteunt de Payment Links
         * API niet. De koppeling aan een boeking staat daarom in onze eigen
         * database: mollie-create-payment heeft het link-id bij de reservering
         * weggeschreven. Eerst kijken wat we al wisten, anders de reservering
         * opzoeken op betaallink_id.
         */
        bedrag = getal(onderwerp.amount?.value);
        betaaldOp = onderwerp.paidAt || null;
        isBetaald = !!onderwerp.paidAt;

        reserveringId = uuidOfNiets(bekend?.reservering_id);

        if (!reserveringId) {
          const { data: res } = await supabase
            .from("reserveringen")
            .select("id")
            .eq("betaallink_id", kenmerk)
            .maybeSingle();

          reserveringId = res?.id ? String(res.id) : null;
        }

        record = {
          mollie_id: onderwerp.id,
          kenmerk_soort: "payment-link",
          // Een betaallink kent geen status zoals een betaling; paidAt is de
          // enige harde aanwijzing dat er geld binnen is.
          status: isBetaald ? "paid" : (onderwerp.status || "open"),
          mode: onderwerp.mode || null,
          bedrag,
          valuta: onderwerp.amount?.currency || "EUR",
          omschrijving: onderwerp.description || null,
          reservering: bekend?.reservering || null,
          reservering_id: reserveringId,
          welkomstcall_id: uuidOfNiets(bekend?.welkomstcall_id),
          soort: bekend?.soort || null,
          gast: bekend?.gast || null,
          checkout_url: onderwerp._links?.paymentLink?.href || null,
          betaald_op: betaaldOp,
          verlopen_op: onderwerp.expiresAt || null,
          mollie_aangemaakt_op: onderwerp.createdAt || null,
          bijgewerkt_op: new Date().toISOString(),
        };
      } else {
        // De oude weg: een losse betaling met metadata.
        const metadata = onderwerp.metadata &&
            typeof onderwerp.metadata === "object"
          ? onderwerp.metadata
          : {};

        bedrag = getal(onderwerp.amount?.value);
        betaaldOp = onderwerp.paidAt || null;
        isBetaald = onderwerp.status === "paid";

        reserveringId = uuidOfNiets(metadata.reservering_id) ||
          uuidOfNiets(bekend?.reservering_id);

        record = {
          mollie_id: onderwerp.id,
          kenmerk_soort: "payment",
          status: onderwerp.status,
          mode: onderwerp.mode,
          bedrag,
          valuta: onderwerp.amount?.currency || "EUR",
          omschrijving: onderwerp.description || null,
          reservering: metadata.reservering || bekend?.reservering || null,
          reservering_id: reserveringId,
          welkomstcall_id: uuidOfNiets(metadata.welkomstcall_id) ||
            uuidOfNiets(bekend?.welkomstcall_id),
          soort: metadata.soort || bekend?.soort || null,
          gast: metadata.gast || bekend?.gast || null,
          checkout_url: onderwerp._links?.checkout?.href || null,
          betaald_op: betaaldOp,
          verlopen_op: onderwerp.expiresAt || null,
          mollie_aangemaakt_op: onderwerp.createdAt || null,
          bijgewerkt_op: new Date().toISOString(),
        };
      }

      const { error } = await supabase
        .from("mollie_betalingen")
        .upsert(record, { onConflict: "mollie_id" });

      if (error) {
        console.error("Betaling opslaan mislukt:", error);

        return jsonAntwoord(
          { error: "De betaalstatus kon niet worden opgeslagen." },
          500,
        );
      }

      /*
       * En dan de boeking zelf. Alleen bij een nieuwe, geslaagde betaling:
       * was hij al als betaald verwerkt, dan zou optellen het bedrag
       * verdubbelen.
       */
      let reserveringBijgewerkt = false;

      if (isBetaald && !wasAlBetaald && reserveringId && bedrag > 0) {
        reserveringBijgewerkt = await zetReserveringBetaald(
          supabase,
          reserveringId,
          bedrag,
          betaaldOp,
        );
      } else if (isBetaald && !reserveringId) {
        console.error(
          `Betaling ${kenmerk} is voldaan maar hoort bij geen enkele ` +
            "reservering. Handmatig nalopen.",
        );
      }

      console.info(
        `Mollie ${isLink ? "betaallink" : "betaling"} ${kenmerk} bijgewerkt ` +
          `naar ${record.status}`,
      );

      return jsonAntwoord({
        success: true,
        kenmerk,
        soort: isLink ? "payment-link" : "payment",
        status: record.status,
        reserveringBijgewerkt,
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
