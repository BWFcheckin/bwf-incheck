// Supabase Edge Function: wati-chats
//
// Haalt de WhatsApp-gesprekken uit Wati op, zodat ze in het dashboard te lezen
// zijn. Angela, 21-09-2026: "ik wil via het dashboard ook alle chats kunnen
// openen van Wati."
//
// WAAROM DIT NIET RECHTSTREEKS UIT DE BROWSER KAN
// De dashboards zijn gewone HTML-bestanden op GitHub Pages; iedereen kan de
// broncode lezen. Zou het Wati-token daarin staan, dan kan elke bezoeker alle
// gesprekken met gasten lezen en berichten versturen namens het bedrijf. Het
// token blijft daarom hier, achter deze functie, en de browser krijgt alleen
// het antwoord. Daar komt bij dat Wati geen aanroepen vanuit een browser
// toestaat (geen CORS-kopregels).
//
// WIE MAG ERBIJ
// Alleen wie is ingelogd én een toegangsrol heeft die hier is toegestaan. Dat
// wordt niet aan het scherm overgelaten: deze functie vraagt het zelf op met
// bwf_toegangsrol(), dezelfde functie waar de RLS-regels op draaien. In de
// gesprekken staan telefoonnummers en persoonlijke berichten van gasten, dus
// dit is bewust krapper gezet dan de rest van het dashboard - zie MAG_LEZEN.
//
// Aanroepen (met het sessietoken van de ingelogde medewerker):
//   POST { wat: "gesprekken", zoek?: "...", bladzijde?: 1 }
//   POST { wat: "berichten", nummer: "31612345678", bladzijde?: 1 }
//
// Secrets: WATI_ENDPOINT, WATI_TOKEN (al gezet voor whatsapp-spoed),
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// "Verify JWT" mag aan blijven staan.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const TOEGESTAAN = "https://bwfcheckin.github.io";

const cors = {
  "Access-Control-Allow-Origin": TOEGESTAAN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* Welke rollen de gesprekken mogen inzien. Een locatiemanager staat hier
   bewust niet in: Angela heeft op 21-09-2026 ook het klantbeheer voor die rol
   uit het menu gehaald, en in deze gesprekken staat hetzelfde soort gegevens.
   Wil ze het verruimen, dan hoeft alleen deze lijst mee. */
const MAG_LEZEN = ["eigenaar", "vr"];

function antwoord(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

/* Alleen de velden die het scherm nodig heeft. Wati stuurt per contact ruim
   veertig velden mee, waaronder van alles over campagnes en scores; die horen
   niet in een dashboard thuis en maken het antwoord onnodig zwaar. */
function kortContact(c: Record<string, unknown>) {
  return {
    naam: c.fullName || c.displayName || c.firstName || c.wAid || c.phone,
    nummer: c.phone || c.wAid,
    laatste: c.lastUpdated || c.created,
    ongelezen: Number(c.unreadCount) || 0,
  };
}

function kortBericht(m: Record<string, unknown>) {
  return {
    tekst: m.text || "",
    soort: m.type || "text",
    /* eventOwner zegt wie het stuurde; "business" is Bed & Wellness zelf */
    vanOns: String(m.owner) === "true" || String(m.eventOwner || "").toLowerCase() === "business",
    tijd: m.created || m.timestamp,
    status: m.statusString || m.status,
    media: m.data && typeof m.data === "string" ? m.data : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return antwoord({ fout: "alleen POST" }, 405);

  const meegestuurd = req.headers.get("Authorization") || "";
  if (!meegestuurd.toLowerCase().startsWith("bearer ")) {
    return antwoord({ fout: "Log eerst in." }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "";

  /* De rol opvragen namens de gebruiker zelf, met zijn eigen token. Zo geldt
     precies wat de database van hem vindt, en kan een scherm zich hier niet
     voor iemand anders uitgeven. */
  let rol = "";
  try {
    const r = await fetch(url.replace(/\/$/, "") + "/rest/v1/rpc/bwf_toegangsrol", {
      method: "POST",
      headers: { apikey: anon, Authorization: meegestuurd, "Content-Type": "application/json" },
      body: "{}",
    });
    if (r.ok) rol = String(await r.json() || "").replace(/"/g, "").toLowerCase();
  } catch (_) { /* rol blijft leeg */ }

  if (!rol) return antwoord({ fout: "Log eerst in." }, 401);
  if (MAG_LEZEN.indexOf(rol) < 0) {
    return antwoord({ fout: "Deze gesprekken zijn niet voor jouw rol." }, 403);
  }

  const endpoint = (Deno.env.get("WATI_ENDPOINT") || "").replace(/\/+$/, "");
  const token = Deno.env.get("WATI_TOKEN") || "";
  if (!endpoint || !token) return antwoord({ fout: "Wati is nog niet ingesteld." }, 503);

  let vraag: Record<string, unknown> = {};
  try { vraag = await req.json(); } catch (_) { /* leeg */ }

  const bladzijde = Math.max(1, Number(vraag.bladzijde) || 1);
  const perBladzijde = 40;

  async function bijWati(pad: string) {
    const r = await fetch(endpoint + "/api/v1/" + pad, {
      headers: { Authorization: "Bearer " + token },
    });
    const ruw = await r.text();
    if (!r.ok) throw new Error("Wati antwoordde met " + r.status + ": " + ruw.slice(0, 200));
    try { return JSON.parse(ruw); } catch (_) { throw new Error("Wati gaf geen leesbaar antwoord."); }
  }

  try {
    if (vraag.wat === "gesprekken") {
      const zoek = String(vraag.zoek || "").trim();
      const d = await bijWati("getContacts?pageSize=" + perBladzijde +
        "&pageNumber=" + bladzijde +
        (zoek ? "&name=" + encodeURIComponent(zoek) : ""));
      const lijst = (d.contact_list || []) as Record<string, unknown>[];
      return antwoord({
        gesprekken: lijst.map(kortContact),
        meer: lijst.length === perBladzijde,
        bladzijde,
      });
    }

    if (vraag.wat === "berichten") {
      const nummer = String(vraag.nummer || "").replace(/\D/g, "");
      if (!nummer) return antwoord({ fout: "Geen nummer meegegeven." }, 400);
      const d = await bijWati("getMessages/" + nummer + "?pageSize=60&pageNumber=" + bladzijde);
      const items = ((d.messages && d.messages.items) || []) as Record<string, unknown>[];
      /* Wati levert nieuwste eerst; een gesprek leest van boven naar beneden. */
      return antwoord({
        nummer,
        berichten: items.map(kortBericht).reverse(),
        totaal: (d.messages && d.messages.total) || items.length,
      });
    }

    return antwoord({ fout: "Onbekende vraag." }, 400);
  } catch (e) {
    return antwoord({ fout: String((e as Error).message || e) }, 502);
  }
});
