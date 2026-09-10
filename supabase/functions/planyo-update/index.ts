// BWF — veilige Edge Function voor het verplaatsen en bijwerken van Planyo-reserveringen.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

function antwoord(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function tekst(v: unknown) {
  return String(v ?? "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return antwoord({ error: "Alleen POST is toegestaan." }, 405);

  // Supabase Edge Functions controleert de meegestuurde JWT wanneer Verify JWT aanstaat.
  if (!req.headers.get("authorization")) {
    return antwoord({ error: "Log eerst in om een reservering te wijzigen." }, 401);
  }

  const apiKey = Deno.env.get("PLANYO_API_KEY");
  if (!apiKey) return antwoord({ error: "PLANYO_API_KEY ontbreekt in Supabase Secrets." }, 500);

  try {
    const body = await req.json();
    if (body.action && body.action !== "update-reservation") {
      return antwoord({ error: "Onbekende actie." }, 400);
    }

    const reservationId = tekst(body.reservation_id);
    const startTime = tekst(body.start_time);
    const endTime = tekst(body.end_time);
    const resourceId = tekst(body.resource_id);

    if (!reservationId || !/^\d+$/.test(reservationId)) {
      return antwoord({ error: "Een geldig Planyo-reserveringsnummer is verplicht." }, 400);
    }
    if (!startTime || !endTime) {
      return antwoord({ error: "Aankomst en vertrek zijn verplicht." }, 400);
    }
    if (new Date(endTime.replace(" ", "T")) <= new Date(startTime.replace(" ", "T"))) {
      return antwoord({ error: "Het vertrek moet na de aankomst liggen." }, 400);
    }

    const params = new URLSearchParams({
      api_key: apiKey,
      method: "modify_reservation",
      reservation_id: reservationId,
      start_time: startTime,
      end_time: endTime
    });

    // Beide namen worden meegestuurd voor compatibiliteit met Planyo-sites
    // waarop een resourcewissel als resource_id of new_resource_id wordt verwerkt.
    if (resourceId) {
      params.set("resource_id", resourceId);
      params.set("new_resource_id", resourceId);
    }
    if (body.custom_price !== undefined && body.custom_price !== null && body.custom_price !== "") {
      params.set("custom_price", String(Number(body.custom_price) || 0));
    }
    if (tekst(body.notes)) params.set("admin_notes", tekst(body.notes));
    params.set("send_notifications", body.send_notifications ? "true" : "false");

    const response = await fetch("https://www.planyo.com/rest/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: params.toString()
    });

    const raw = await response.text();
    let data: any;
    try { data = JSON.parse(raw); } catch { data = { raw }; }

    const fout =
      !response.ok ||
      data?.response_code === 1 ||
      data?.error ||
      data?.error_message ||
      data?.data?.error;

    if (fout) {
      const melding =
        data?.error_message || data?.error || data?.data?.error ||
        (typeof data?.data === "string" ? data.data : "") ||
        `Planyo gaf HTTP ${response.status}.`;
      return antwoord({ error: `Planyo kon de reservering niet aanpassen: ${melding}`, planyo: data }, 400);
    }

    return antwoord({
      ok: true,
      reservation_id: reservationId,
      resource_id: resourceId || null,
      start_time: startTime,
      end_time: endTime,
      planyo: data
    });
  } catch (error) {
    return antwoord({ error: error instanceof Error ? error.message : "Onbekende fout." }, 500);
  }
});
