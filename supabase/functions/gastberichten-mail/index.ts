// Supabase Edge Function: gastberichten-mail
// Leest de gastberichten die Booking.com per e-mail stuurt ("Wij hebben dit bericht ontvangen van …",
// afzender <nummer>-…@guest.booking.com) en geeft ze door aan public.gastberichten_verwerk(), die ze
// in gast_berichten zet en aan de reservering koppelt. Aan de reservering zelf verandert niets.
//
// Aanroepen: POST met header x-gastberichten-token (= secret GASTBERICHTEN_TOKEN), door het Google
//            Apps Script docs/apps-script/gastberichten.gs. Body:
//              { proef: true|false, mails: [{ id, datum, onderwerp, van, tekst }] }
//            proef (standaard true): alles nalopen en teruggeven, niets schrijven.
// Regels:    migratie 20261013210000_gastberichten.sql, installatie docs/GASTBERICHTEN-INSTALLATIE.md.

import { leesBookingMail, type Rij } from "./lees.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TOKEN = Deno.env.get("GASTBERICHTEN_TOKEN") ?? "";
const MAX_MAILS = 100;
const AFZENDER = /@guest\.booking\.com\s*>?\s*$/i;

function antwoord(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function veiligGelijk(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let verschil = 0;
  for (let i = 0; i < a.length; i++) verschil |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return verschil === 0;
}

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !SERVICE_KEY || !TOKEN) {
    return antwoord({ fout: "Instellingen ontbreken (SUPABASE_URL, service role of GASTBERICHTEN_TOKEN)." }, 500);
  }
  if (!veiligGelijk(req.headers.get("x-gastberichten-token") ?? "", TOKEN)) return antwoord({ fout: "Niet toegestaan." }, 401);
  if (req.method !== "POST") return antwoord({ fout: "Gebruik POST." }, 405);

  let body: Rij;
  try { body = await req.json(); } catch { return antwoord({ fout: "Ongeldige aanvraag." }, 400); }
  const mails: Rij[] = Array.isArray(body.mails) ? body.mails : [];
  if (mails.length > MAX_MAILS) return antwoord({ fout: `Hooguit ${MAX_MAILS} mails per keer.` }, 400);
  const proef = body.proef !== false; // alleen een uitdrukkelijke false schrijft

  const resultaten: Rij[] = [];
  const door: Rij[] = [];
  for (const mail of mails) {
    const id = String(mail.id ?? "");
    if (!id) { resultaten.push({ mail_id: "", uitkomst: "overgeslagen", toelichting: "mail zonder id" }); continue; }
    if (!AFZENDER.test(String(mail.van ?? ""))) {
      resultaten.push({ mail_id: id, uitkomst: "overgeslagen", toelichting: "afzender is geen @guest.booking.com" });
      continue;
    }
    const gelezen = leesBookingMail(mail);
    if (!gelezen.bericht) {
      resultaten.push({ mail_id: id, nummer: gelezen.nummer, uitkomst: "onleesbaar", toelichting: "geen berichttekst gevonden" });
      continue;
    }
    door.push(gelezen);
  }

  // Ook zonder nieuwe mails aanroepen: dan probeert de database eerder ongekoppelde berichten opnieuw.
  if (door.length || !proef) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/gastberichten_verwerk`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_berichten: door, p_proef: proef }),
    });
    const tekst = await r.text();
    if (!r.ok) return antwoord({ fout: `gastberichten_verwerk: HTTP ${r.status} ${tekst.slice(0, 300)}` }, 500);
    resultaten.push(...(JSON.parse(tekst) as Rij[]));
  }

  const telling: Record<string, number> = {};
  for (const x of resultaten) telling[x.uitkomst] = (telling[x.uitkomst] ?? 0) + 1;
  return antwoord({ versie: 1, proef, telling, resultaten });
});
