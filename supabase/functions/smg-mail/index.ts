// Supabase Edge Function: smg-mail
// Leest de bedragen uit de mails van Privésauna (SMG) - "Verhuur-oke? #nummer" en "Bevestiging #nummer" -
// en geeft ze door aan de databasefunctie public.smg_mail_verwerk(). De ICS-feed van SMG bevat geen bedragen.
//
// Aanroepen: POST met header x-smg-token (= secret SMG_MAIL_TOKEN), door het Google Apps Script
//            docs/apps-script/smg-mail.gs. Body:
//              { proef: true|false, nieuwe_velden: true|false,
//                mails: [{ id, datum, onderwerp, van, tekst }] }
//            proef (standaard true): alles nalopen en teruggeven, niets schrijven.
// Regels:    migratie 20261012200000_smg_mail.sql en OPDRACHT-PLANYO-EN-BEDRAGEN.md, stap 2A.
//            Er wordt nooit een reservering aangemaakt; een onbekend nummer wordt alleen gelogd.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TOKEN = Deno.env.get("SMG_MAIL_TOKEN") ?? "";
const MAX_MAILS = 100;
const AFZENDER = /@mg\.specialmoments\.group\s*>?\s*$/i;

// deno-lint-ignore no-explicit-any
type Rij = Record<string, any>;

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

/* ---------- de mail lezen ---------- */

const BEDRAG = "€\\s*(-?[\\d.]+,\\d{2})";
const getal = (s: string) => Math.round(Number(s.replace(/\./g, "").replace(",", ".")) * 100) / 100;

/* Het bedrag achter een label. Het label mag niet midden in een ander woord staan:
   "Totaal" mag "Subtotaal" niet vangen. */
function bedragNa(tekst: string, label: string): number | null {
  const m = tekst.match(new RegExp(`(?:^|[^A-Za-zÀ-ÿ])${label}\\s*:?\\s*${BEDRAG}`));
  return m ? getal(m[1]) : null;
}

/* Twee opmaken (gezien september 2026):
   Verhuur-oke:  Basisprijs · Arrangementen · Subtotaal · Transactiekosten · Servicekosten · Totaal · Betaald · Te betalen
   Bevestiging:  "Reservering € 619,00 inclusief € 2,00 servicekosten." · Totaal · Te betalen   (geen regel Betaald)
   Totaal is in beide wat de gast betaalt, inclusief servicekosten. */
function leesMail(mail: Rij): Rij {
  const onderwerp = String(mail.onderwerp ?? "");
  const tekst = String(mail.tekst ?? "").replace(/ /g, " ");
  const soort = /^\s*Verhuur-oke/i.test(onderwerp) ? "verhuur" : /^\s*Bevestiging\s*#/i.test(onderwerp) ? "bevestiging" : null;
  const nummer = onderwerp.match(/#\s*(\d{5,8})/)?.[1] ?? tekst.match(/Reservering\s*#\s*(\d{5,8})/)?.[1] ?? null;

  const totaal = bedragNa(tekst, "Totaal");
  let betaald = bedragNa(tekst, "Betaald");
  let teBetalen = bedragNa(tekst, "Te betalen");
  if (totaal !== null && betaald === null && teBetalen !== null) betaald = Math.round((totaal - teBetalen) * 100) / 100;
  if (totaal !== null && teBetalen === null && betaald !== null) teBetalen = Math.round((totaal - betaald) * 100) / 100;
  const inclusief = tekst.match(new RegExp(`inclusief\\s*${BEDRAG}\\s*servicekosten`, "i"));
  const servicekosten = bedragNa(tekst, "Servicekosten") ?? (inclusief ? getal(inclusief[1]) : null);

  // "×1 Verjaardags arrangement (€ 75,00)"
  const arrangementen: string[] = [];
  for (const m of tekst.matchAll(/(?:×|(?<![A-Za-zÀ-ÿ])x)\s*(\d+)\s+([^\n(€*]+?)\s*\(\s*€\s*(-?[\d.]+,\d{2})\s*\)/g)) {
    arrangementen.push(`×${m[1]} ${m[2].trim()} (€ ${m[3]})`);
  }

  return {
    mail_id: String(mail.id ?? ""),
    mail_datum: mail.datum ? new Date(String(mail.datum)).toISOString() : null,
    soort,
    nummer,
    totaal,
    betaald,
    te_betalen: teBetalen,
    servicekosten,
    arrangementen_tekst: arrangementen.join("\n") || null,
  };
}

/* ---------- aanroep ---------- */

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !SERVICE_KEY || !TOKEN) {
    return antwoord({ fout: "Instellingen ontbreken (SUPABASE_URL, service role of SMG_MAIL_TOKEN)." }, 500);
  }
  if (!veiligGelijk(req.headers.get("x-smg-token") ?? "", TOKEN)) return antwoord({ fout: "Niet toegestaan." }, 401);
  if (req.method !== "POST") return antwoord({ fout: "Gebruik POST." }, 405);

  let body: Rij;
  try { body = await req.json(); } catch { return antwoord({ fout: "Ongeldige aanvraag." }, 400); }
  const mails: Rij[] = Array.isArray(body.mails) ? body.mails : [];
  if (!mails.length) return antwoord({ fout: "Geen mails meegestuurd." }, 400);
  if (mails.length > MAX_MAILS) return antwoord({ fout: `Hooguit ${MAX_MAILS} mails per keer.` }, 400);
  const proef = body.proef !== false; // alleen een uitdrukkelijke false schrijft

  const resultaten: Rij[] = [];
  const door: Rij[] = [];
  for (const mail of mails) {
    const id = String(mail.id ?? "");
    if (!id) { resultaten.push({ mail_id: "", uitkomst: "overgeslagen", toelichting: "mail zonder id" }); continue; }
    if (!AFZENDER.test(String(mail.van ?? ""))) {
      resultaten.push({ mail_id: id, uitkomst: "overgeslagen", toelichting: "afzender is niet Special Moments Group" });
      continue;
    }
    const gelezen = leesMail(mail);
    if (!gelezen.soort) {
      resultaten.push({ mail_id: id, nummer: gelezen.nummer, uitkomst: "overgeslagen", toelichting: "geen Verhuur-oke of Bevestiging" });
      continue;
    }
    door.push(gelezen);
  }

  if (door.length) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/smg_mail_verwerk`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_mails: door, p_proef: proef, p_nieuwe_velden: body.nieuwe_velden === true }),
    });
    const tekst = await r.text();
    if (!r.ok) return antwoord({ fout: `smg_mail_verwerk: HTTP ${r.status} ${tekst.slice(0, 300)}` }, 500);
    resultaten.push(...(JSON.parse(tekst) as Rij[]));
  }

  const telling: Record<string, number> = {};
  for (const x of resultaten) telling[x.uitkomst] = (telling[x.uitkomst] ?? 0) + 1;
  return antwoord({ versie: 1, proef, telling, resultaten });
});
