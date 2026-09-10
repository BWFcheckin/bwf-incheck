/*
 * Beveiligde Planyo-doorvoer voor het BWF-dashboard.
 * Secrets: PLANYO_API_KEY, SUPABASE_URL en SUPABASE_ANON_KEY.
 */

const PLANYO_API = "https://www.planyo.com/rest/";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS"
    }
  });
}

async function isIngelogd(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!auth.startsWith("Bearer ") || !supabaseUrl || !anonKey) return false;
  const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { authorization: auth, apikey: anonKey }
  });
  return r.ok;
}

async function betalingOpslag(
  pad: string,
  opties: { method?: string; headers?: Record<string, string>; body?: string } = {}
) {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("De Supabase-opslag voor betalingen ontbreekt.");
  const r = await fetch(`${url}/rest/v1/${pad}`, {
    ...opties,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(opties.headers || {})
    }
  });
  const tekst = await r.text();
  if (!r.ok) throw new Error(`Betaalstatus opslaan mislukte (${r.status}): ${tekst.slice(0, 180)}`);
  return tekst ? JSON.parse(tekst) : null;
}

function datumTijd(value: string | null, fallback: Date) {
  const raw = (value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw} 00:00`
    : `${fallback.toISOString().slice(0, 10)} 00:00`;
}

function telefoon(r: Record<string, unknown>) {
  const mobiel = String(r.mobile_number || "");
  const mobielLand = String(r.mobile_country_code || "");
  const vast = String(r.phone || r.phone_number || "");
  const vastLand = String(r.phone_country_code || "");
  if (mobiel) return (mobielLand ? `+${mobielLand}` : "") + mobiel;
  return (vastLand ? `+${vastLand}` : "") + vast;
}

function eventVanReservering(r: Record<string, unknown>) {
  const voornaam = String(r.first_name || "").trim();
  const achternaam = String(r.last_name || "").trim();
  const naam = `${voornaam} ${achternaam}`.trim();
  const status = Number(r.status || 0);
  const notities = String(r.admin_notes || r.user_notes || "");
  const isBlokkade = notities.includes("[BWF-BLOKKADE]") || String(r.refcode || "") === "BWF-BLOKKADE";
  const blokReden = notities.replace("[BWF-BLOKKADE]", "").trim() || "Niet beschikbaar";
  return {
    id: String(r.reservation_id || ""),
    nummer: String(r.reservation_id || ""),
    start: String(r.start_time || ""),
    eind: String(r.end_time || ""),
    suite: String(r.name || ""),
    gast: isBlokkade ? "" : naam,
    voornaam,
    achternaam,
    email: String(r.email || ""),
    telefoon: telefoon(r),
    adres: [r.address, r.zip, r.city, r.country].filter(Boolean).join(", "),
    personen: String(r.quantity || ""),
    totaal: Number(r.total_price || 0),
    betaald: Number(r.amount_paid || 0),
    status,
    statusLabel: status === 4 ? "Bevestigd" : status === 8 || status === 16 ? "Geannuleerd" : "In behandeling",
    soort: status === 8 || status === 16 ? "geannuleerd" : isBlokkade ? "blok" : "reservering",
    bron: "Planyo",
    titel: isBlokkade ? blokReden : (naam || `Reservering ${r.reservation_id || ""}`),
    omschrijving: isBlokkade ? blokReden : notities,
    assignment: String(r.unit_assignment || "")
  };
}

async function planyo(method: string, extra: Record<string, string>) {
  const apiKey = Deno.env.get("PLANYO_API_KEY") || "";
  if (!apiKey) throw new Error("PLANYO_API_KEY is nog niet ingesteld.");
  const params = new URLSearchParams({ method, api_key: apiKey, language: "NL", ...extra });
  const r = await fetch(`${PLANYO_API}?${params.toString()}`, {
    headers: { accept: "application/json" }
  });
  const text = await r.text();
  let data: Record<string, unknown>;
  try { data = JSON.parse(text); }
  catch { throw new Error("Planyo gaf geen geldig antwoord."); }
  /* Planyo: response_code 0 = gelukt; elke andere code is een fout, ook 1, 2, 3…
     Eerder werd alleen -1 als fout gezien, waardoor bijvoorbeeld een geweigerde
     reservering als "gelukt" terugkwam zonder reserveringsnummer. */
  const code = data.response_code === undefined ? 0 : Number(data.response_code);
  if (!r.ok || code !== 0 || data.error) {
    throw new Error(String(data.error || data.response_message || `Planyo weigerde de aanvraag (code ${code}).`));
  }
  const payload = data.data && typeof data.data === "object" && !Array.isArray(data.data)
    ? data.data as Record<string, unknown>
    : {};
  return { ...data, ...payload };
}

function lijstUit(data: Record<string, unknown>, namen: string[]) {
  for (const naam of namen) {
    if (Array.isArray(data[naam])) return data[naam] as unknown[];
  }
  if (Array.isArray(data.data)) return data.data as unknown[];
  const response = data.response;
  if (response && typeof response === "object") {
    const obj = response as Record<string, unknown>;
    for (const naam of namen) {
      if (Array.isArray(obj[naam])) return obj[naam] as unknown[];
    }
    if (Array.isArray(obj.data)) return obj.data as unknown[];
  }
  return [];
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "GET" && request.method !== "POST") return json({ error: "Methode niet toegestaan." }, 405);
  if (!(await isIngelogd(request))) return json({ error: "Niet ingelogd." }, 401);

  const url = new URL(request.url);
  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    try { body = await request.json(); }
    catch { return json({ error: "Ongeldige aanvraag." }, 400); }
  }
  const action = String(body.action || url.searchParams.get("action") || "reservations");

  try {
    if (action === "customers") {
      const page = String(Math.max(0, Number(url.searchParams.get("page") || 0)));
      const data = await planyo("list_users", { page, page_size: "1000", detail_level: "1" });
      const users = lijstUit(data, ["users", "results"]);
      return json({ customers: users, page: Number(page), source: "Planyo" });
    }

    if (action === "resources") {
      const data = await planyo("list_resources", { detail_level: "1" });
      const resources = lijstUit(data, ["resources", "results"]);
      return json({ resources, source: "Planyo" });
    }

    if (action === "create-reservation") {
      if (request.method !== "POST") return json({ error: "Gebruik POST om een reservering aan te maken." }, 405);
      const resourceId = String(body.resource_id || "").trim();
      const startTime = String(body.start_time || "").trim();
      const endTime = String(body.end_time || "").trim();
      const userId = String(body.user_id || "").trim();
      const email = String(body.email || "").trim();
      const firstName = String(body.first_name || "").trim();
      if (!resourceId || !startTime || !endTime || (!userId && (!email || !firstName))) {
        return json({ error: "Accommodatie, aankomst, vertrek en een gekoppelde klant zijn verplicht." }, 400);
      }
      const aantal = Number(body.quantity || 1);
      const params: Record<string, string> = {
        resource_id: resourceId,
        start_time: startTime,
        end_time: endTime,
        quantity: String(Number.isFinite(aantal) ? Math.max(1, aantal) : 1),
        email,
        first_name: firstName,
        last_name: String(body.last_name || ""),
        phone: String(body.phone || ""),
        address: String(body.address || ""),
        city: String(body.city || ""),
        user_notes: String(body.notes || ""),
        refcode: String(body.refcode || "BWF-dashboard"),
        admin_mode: "true",
        send_notifications: body.send_notifications === false ? "false" : "true"
      };
      if (userId) params.user_id = userId;
      const price = Number(body.custom_price || 0);
      if (price > 0) params.custom_price = String(price);
      const data = await planyo("make_reservation", params);
      if (!data.reservation_id) {
        throw new Error("Planyo gaf geen reserveringsnummer terug: " +
          String(data.response_message || JSON.stringify(data).slice(0, 200)));
      }
      return json({
        reservation_id: data.reservation_id,
        user_id: data.user_id || userId || "",
        status: data.status,
        price: data.price,
        source: "Planyo"
      }, 201);
    }

    if (action === "update-reservation") {
      /* Eén wijziging centraal in Planyo doorvoeren. Datum, tijd en aantal
         personen gaan via modify_reservation; notities via set_reservation_notes;
         telefoon en e-mail via modify_user op de gekoppelde klant. */
      if (request.method !== "POST") return json({ error: "Gebruik POST om een reservering te wijzigen." }, 405);
      const reservationId = String(body.reservation_id || "").trim();
      if (!/^\d+$/.test(reservationId)) return json({ error: "Een geldig Planyo-reserveringsnummer is verplicht." }, 400);

      const wijzigingen: string[] = [];
      const waarschuwingen: string[] = [];

      const startTime = String(body.start_time || "").trim();
      const endTime = String(body.end_time || "").trim();
      const aantal = Number(body.quantity || 0);
      const basis: Record<string, string> = {};
      if (startTime) basis.start_time = startTime;
      if (endTime) basis.end_time = endTime;
      if (Number.isFinite(aantal) && aantal > 0) basis.quantity = String(Math.floor(aantal));
      if (Object.keys(basis).length) {
        await planyo("modify_reservation", {
          reservation_id: reservationId,
          admin_mode: "true",
          send_notifications: body.send_notifications === true ? "true" : "false",
          ...basis
        });
        wijzigingen.push("datum/tijd");
      }

      if (typeof body.admin_notes === "string") {
        try {
          await planyo("set_reservation_notes", {
            reservation_id: reservationId,
            admin_notes: String(body.admin_notes).slice(0, 2000)
          });
          wijzigingen.push("notitie");
        } catch (e) {
          waarschuwingen.push("Notitie: " + (e instanceof Error ? e.message : "niet opgeslagen"));
        }
      }

      const email = String(body.email || "").trim();
      const phone = String(body.phone || "").trim();
      const firstName = String(body.first_name || "").trim();
      const lastName = String(body.last_name || "").trim();
      if (email || phone || firstName || lastName) {
        try {
          const res = await planyo("get_reservation_data", { reservation_id: reservationId });
          const userId = String(res.user_id || "");
          if (!userId) throw new Error("De klant van deze reservering is niet gevonden.");
          const klant: Record<string, string> = { user_id: userId };
          if (email) klant.email = email;
          if (phone) { klant.phone = phone; klant.mobile_number = phone; }
          if (firstName) klant.first_name = firstName;
          if (lastName) klant.last_name = lastName;
          await planyo("modify_user", klant);
          wijzigingen.push("klantgegevens");
        } catch (e) {
          waarschuwingen.push("Klantgegevens: " + (e instanceof Error ? e.message : "niet opgeslagen"));
        }
      }

      return json({
        reservation_id: reservationId,
        updated: wijzigingen,
        warnings: waarschuwingen,
        source: "Planyo",
        updatedAt: new Date().toISOString()
      });
    }

    if (action === "create-block") {
      if (request.method !== "POST") return json({ error: "Gebruik POST om een blokkade aan te maken." }, 405);
      const resourceId = String(body.resource_id || "").trim();
      const startTime = String(body.start_time || "").trim();
      const endTime = String(body.end_time || "").trim();
      const reason = String(body.reason || "Niet beschikbaar").trim().slice(0, 180);
      if (!resourceId || !startTime || !endTime) {
        return json({ error: "Suite, begindatum en einddatum zijn verplicht." }, 400);
      }
      const data = await planyo("make_reservation", {
        resource_id: resourceId,
        start_time: startTime,
        end_time: endTime,
        quantity: "1",
        email: "info@bedenwellnessflevoland.nl",
        first_name: "Niet beschikbaar",
        last_name: reason,
        user_notes: `[BWF-BLOKKADE] ${reason}`,
        admin_notes: `[BWF-BLOKKADE] ${reason}`,
        refcode: "BWF-BLOKKADE",
        admin_mode: "true",
        send_notifications: "false",
        custom_price: "0"
      });
      return json({
        block_id: data.reservation_id,
        reservation_id: data.reservation_id,
        status: data.status,
        source: "Planyo",
        type: "block"
      }, 201);
    }

    if (action === "create-payment") {
      if (request.method !== "POST") return json({ error: "Gebruik POST om een betaling aan te maken." }, 405);
      const mollieKey = Deno.env.get("MOLLIE_API_KEY") || "";
      if (!mollieKey) return json({ error: "MOLLIE_API_KEY is nog niet ingesteld in Supabase." }, 503);
      const bedrag = Number(body.amount || 0);
      if (!Number.isFinite(bedrag) || bedrag < 0.01) return json({ error: "Het te betalen bedrag is ongeldig." }, 400);
      const reserveringId = String(body.reservation_id || "").trim();
      if (!reserveringId) return json({ error: "Het reserveringsnummer ontbreekt." }, 400);
      const factuurnummer = String(body.invoice_number || "").trim();

      /* Een bestaande actieve link voor exact dezelfde reservering en hetzelfde
         bedrag hergebruiken. Zo maakt dubbel klikken geen tweede betaling. */
      try {
        const bestaand = await betalingOpslag(
          `bwf_betalingen?select=*&reservering_id=eq.${encodeURIComponent(reserveringId)}` +
          `&bedrag=eq.${bedrag.toFixed(2)}&status=in.(open,pending)&order=aangemaakt.desc&limit=1`
        );
        if (Array.isArray(bestaand) && bestaand[0]) {
          return json({
            payment_id: bestaand[0].mollie_payment_id,
            checkout_url: bestaand[0].checkout_url,
            status: bestaand[0].status,
            reused: true
          });
        }
      } catch (e) {
        console.warn("Bestaande betaling zoeken lukte niet:", e);
      }

      const omschrijving = String(body.description || "Reservering Bed & Wellness Flevoland").slice(0, 255);
      const idempotencyKey = `bwf-${reserveringId}-${factuurnummer}-${bedrag.toFixed(2)}`
        .replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 255);
      const paymentResponse = await fetch("https://api.mollie.com/v2/payments", {
        method: "POST",
        headers: { authorization: `Bearer ${mollieKey}`, "content-type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          amount: { currency: "EUR", value: bedrag.toFixed(2) },
          description: omschrijving,
          redirectUrl: String(body.redirect_url || "https://bwfcheckin.github.io/bwf-incheck/reserveringen.html"),
          metadata: { reservation_id: reserveringId, invoice_number: factuurnummer }
        })
      });
      const payment = await paymentResponse.json();
      if (!paymentResponse.ok) throw new Error(String(payment.detail || payment.title || "Mollie kon geen betaallink maken."));
      const checkoutUrl = payment._links?.checkout?.href || "";
      let opslagWaarschuwing = "";
      try {
        await betalingOpslag("bwf_betalingen?on_conflict=mollie_payment_id", {
          method: "POST",
          headers: { prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            reservering_id: reserveringId,
            klant_id: String(body.customer_id || "") || null,
            mollie_payment_id: payment.id,
            factuurnummer,
            omschrijving,
            bedrag: bedrag.toFixed(2),
            valuta: "EUR",
            status: payment.status || "open",
            checkout_url: checkoutUrl,
            bijgewerkt: new Date().toISOString()
          })
        });
      } catch (e) {
        opslagWaarschuwing = e instanceof Error ? e.message : "Betaallink kon niet worden opgeslagen.";
      }
      return json({ payment_id: payment.id, checkout_url: checkoutUrl, status: payment.status, warning: opslagWaarschuwing }, 201);
    }

    if (action === "payment-status") {
      if (request.method !== "POST") return json({ error: "Gebruik POST om de betaalstatus te controleren." }, 405);
      const mollieKey = Deno.env.get("MOLLIE_API_KEY") || "";
      if (!mollieKey) return json({ error: "MOLLIE_API_KEY is nog niet ingesteld in Supabase." }, 503);
      const paymentId = String(body.payment_id || "").trim();
      if (!/^tr_[A-Za-z0-9]+$/.test(paymentId)) return json({ error: "Ongeldig Mollie-betalingsnummer." }, 400);
      const paymentResponse = await fetch(`https://api.mollie.com/v2/payments/${paymentId}`, {
        headers: { authorization: `Bearer ${mollieKey}`, accept: "application/json" }
      });
      const payment = await paymentResponse.json();
      if (!paymentResponse.ok) throw new Error(String(payment.detail || payment.title || "Mollie-status kon niet worden opgehaald."));
      try {
        await betalingOpslag(`bwf_betalingen?mollie_payment_id=eq.${encodeURIComponent(paymentId)}`, {
          method: "PATCH",
          headers: { prefer: "return=minimal" },
          body: JSON.stringify({
            status: payment.status,
            betaald_op: payment.paidAt || null,
            bijgewerkt: new Date().toISOString()
          })
        });
      } catch (e) { console.warn("Mollie-status opslaan lukte niet:", e); }
      return json({ payment_id: payment.id, status: payment.status, paid_at: payment.paidAt || null });
    }

    const nu = new Date();
    const later = new Date(nu); later.setFullYear(later.getFullYear() + 2);
    const from = datumTijd(url.searchParams.get("from"), nu);
    const to = datumTijd(url.searchParams.get("to"), later).replace("00:00", "23:59");
    const events: unknown[] = [];
    for (let page = 0; page < 20; page++) {
      const data = await planyo("list_reservations", {
        start_time: from,
        end_time: to,
        detail_level: "7",
        page: String(page)
      });
      const rows = lijstUit(data, ["results", "reservations"]);
      events.push(...rows.map((row) => eventVanReservering(row as Record<string, unknown>)));
      if (rows.length < 500) break;
    }
    return json({ events, source: "Planyo", fetchedAt: new Date().toISOString() });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Onbekende fout." }, 502);
  }
});
