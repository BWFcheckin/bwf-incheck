// Supabase Edge Function: kanalen-sync
// Leest de ICS-feeds van SMG (Privésauna), Booking.com en Origineel Overnachten en schrijft
// reserveringen en blokkades weg via de databasefunctie public.kanalen_verwerk().
//
// Aanroepen: GET of POST met header x-sync-token (= secret KANALEN_SYNC_TOKEN; pg_cron haalt het uit Vault).
//            ?proef=1 → alles verwerken en tellen, niets schrijven.
// ICS-links: uitsluitend als secrets (ICS_<SUITE>_<KANAAL>); de namen staan in kanaal_instellingen.ics_secret.
// Regels:    PLAN-AGENDA-EN-RESERVERINGEN.md, fase 2.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SYNC_TOKEN = Deno.env.get("KANALEN_SYNC_TOKEN") ?? "";
const MAX_NACHTEN_BOOKING = 14;
const FEEDS = ["smg", "booking", "oo"];

type Moment = { datum: string; tijd: string };
type Ev = { uid: string; status: string; summary: string; description: string; start: Moment; eind: Moment };
type Tijdsblok = { id: string; suite: string; type: string; begin: string; eind: string; volgende_dag: boolean };
// deno-lint-ignore no-explicit-any
type Rij = Record<string, any>;

function antwoord(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 1), {
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

/* Foutmeldingen nooit met een ICS-link erin teruggeven of loggen. */
const zonderLinks = (t: string) => t.replace(/(https?|webcal):\/\/\S+/gi, "<link>");
const foutTekst = (e: unknown) => zonderLinks(e instanceof Error ? e.message : String(e));

async function rest(pad: string, methode = "GET", body?: unknown): Promise<Rij> {
  const headers: Record<string, string> = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
  if (methode !== "GET") headers.Prefer = "return=representation";
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${pad}`, {
    method: methode,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const tekst = await r.text();
  if (!r.ok) throw new Error(`${pad.split("?")[0]}: HTTP ${r.status} ${tekst.slice(0, 300)}`);
  return tekst ? JSON.parse(tekst) : null;
}

/* De verwerkfunctie is snel (gemiddeld ~17 ms), maar de gateway geeft af en toe een 504.
   Opnieuw verwerken is veilig (zelfde run, zelfde regels), dus bij een 5xx één keer opnieuw. */
async function verwerk(body: Rij): Promise<Rij> {
  try {
    return await rest("rpc/kanalen_verwerk", "POST", body);
  } catch (e) {
    if (!/HTTP 5\d\d/.test(foutTekst(e))) throw e;
    await new Promise((klaar) => setTimeout(klaar, 3000));
    return await rest("rpc/kanalen_verwerk", "POST", body);
  }
}

async function logFout(run: string, feed: string, suite: string, fout: string) {
  try {
    await rest("kanalen_sync_log", "POST", { run_op: run, bron_feed: feed, suite, gelukt: false, fout });
  } catch {
    /* logtabel niet bereikbaar: de fout staat al in het antwoord */
  }
}

/* ---------- ICS lezen ---------- */

const ontsnap = (t: string) =>
  t.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
const isoDatum = (d8: string) => `${d8.slice(0, 4)}-${d8.slice(4, 6)}-${d8.slice(6, 8)}`;
const amsterdam = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Amsterdam",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/* Datum of datum-tijd uit de feed, als lokale tijd in Amsterdam. Alleen een datum → 00:00. */
function leesMoment(kop: string, waarde: string): Moment {
  const w = waarde.trim();
  if (/^\d{8}$/.test(w) || /VALUE=DATE(?!-)/i.test(kop)) return { datum: isoDatum(w), tijd: "00:00" };
  const m = w.match(/^(\d{8})T(\d{2})(\d{2})\d{2}(Z?)$/);
  if (!m) throw new Error("onbekende datumnotatie");
  if (m[4] === "Z") {
    const d = new Date(Date.UTC(+m[1].slice(0, 4), +m[1].slice(4, 6) - 1, +m[1].slice(6, 8), +m[2], +m[3]));
    const p: Record<string, string> = {};
    for (const x of amsterdam.formatToParts(d)) p[x.type] = x.value;
    return { datum: `${p.year}-${p.month}-${p.day}`, tijd: `${p.hour}:${p.minute}` };
  }
  return { datum: isoDatum(m[1]), tijd: `${m[2]}:${m[3]}` };
}

function leesIcs(tekst: string): { events: Ev[]; onleesbaar: number } {
  if (!/BEGIN:VCALENDAR/.test(tekst)) throw new Error("geen geldige ICS-feed");
  const events: Ev[] = [];
  let onleesbaar = 0;
  for (const blok of tekst.replace(/\r?\n[ \t]/g, "").match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? []) {
    const v: Record<string, { kop: string; waarde: string }> = {};
    for (const regel of blok.split(/\r?\n/)) {
      const i = regel.indexOf(":");
      if (i < 1) continue;
      const kop = regel.slice(0, i);
      const naam = kop.split(";")[0].toUpperCase();
      if (!v[naam]) v[naam] = { kop, waarde: regel.slice(i + 1) };
    }
    try {
      if (!v.UID || !v.DTSTART || !v.DTEND) throw new Error("onvolledig event");
      events.push({
        uid: v.UID.waarde.trim(),
        status: (v.STATUS?.waarde ?? "").trim().toUpperCase(),
        summary: ontsnap(v.SUMMARY?.waarde ?? "").trim(),
        description: ontsnap(v.DESCRIPTION?.waarde ?? "").trim(),
        start: leesMoment(v.DTSTART.kop, v.DTSTART.waarde),
        eind: leesMoment(v.DTEND.kop, v.DTEND.waarde),
      });
    } catch {
      onleesbaar++;
    }
  }
  return { events, onleesbaar };
}

/* ---------- hulpjes ---------- */

const hhmm = (t: string) => t.slice(0, 5);
const lokaal = (m: Moment) => `${m.datum} ${m.tijd}`;
const nachten = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

function veld(tekst: string, label: string): string | null {
  const m = tekst.match(new RegExp(`^[ \\t]*${label}[ \\t]*:[ \\t]*(.+)$`, "im"));
  return m ? m[1].trim() : null;
}

function splitsNaam(naam: string | null): { voornaam: string | null; achternaam: string | null } {
  const delen = (naam ?? "").trim().split(/\s+/).filter(Boolean);
  return { voornaam: delen[0] ?? null, achternaam: delen.slice(1).join(" ") || null };
}

/* Tijdsblok herkennen aan begin- en eindtijd (regel 6 in het plan). */
function kiesBlok(blokken: Tijdsblok[], suite: string, start: Moment, eind: Moment) {
  const volgendeDag = eind.datum > start.datum;
  const eigen = blokken.filter((b) => b.suite === suite && b.volgende_dag === volgendeDag);
  const exact = eigen.find((b) => hhmm(b.begin) === start.tijd && hhmm(b.eind) === eind.tijd);
  if (exact) return { blok: exact, incheck: null, uitcheck: null, opmerking: null };
  const zelfdeBegin = eigen.filter((b) => hhmm(b.begin) === start.tijd);
  if (zelfdeBegin.length === 1) {
    const b = zelfdeBegin[0];
    return {
      blok: b,
      incheck: null,
      uitcheck: eind.tijd,
      opmerking: `uitchecktijd ${eind.tijd} wijkt af van tijdsblok ${hhmm(b.begin)}–${hhmm(b.eind)}`,
    };
  }
  return {
    blok: null,
    incheck: start.tijd,
    uitcheck: eind.tijd,
    opmerking: `geen passend tijdsblok voor ${start.tijd}–${eind.tijd}${volgendeDag ? " (volgende dag)" : ""}`,
  };
}

function reservering(
  blokken: Tijdsblok[], suite: string, kanaal: string, ref: string, uid: string,
  start: Moment, eind: Moment, extra: Rij = {},
): Rij {
  const k = kiesBlok(blokken, suite, start, eind);
  return {
    kanaal,
    kanaal_ref: ref,
    bron_uid: uid,
    type: k.blok?.type ?? (eind.datum > start.datum ? "overnachting" : "dagverblijf"),
    tijdsblok_id: k.blok?.id ?? null,
    aankomst_lokaal: lokaal(start),
    vertrek_lokaal: lokaal(eind),
    incheck_tijd: k.incheck,
    uitcheck_tijd: k.uitcheck,
    ...extra,
    import_opmerking: [k.opmerking, extra.import_opmerking].filter(Boolean).join("; ") || null,
  };
}

/* ---------- importregels per suite ---------- */

/* Wanneer zegt een regel in de SMG-planning dat er geen betalende gast komt?
   Dan hoort er een blokkade te komen en geen lege reservering.

   Angela, 21-09-2026: "ik wil dat reserveringen wel worden aangemaakt, maar als
   het puur om een agenda tijdblokkering gaat wil ik niet dat die als
   reservering aangemaakt wordt." Er stonden 89 van die lege reserveringen; ze
   vulden de lijst "nog te verwerken" (8 van de 17) en telden mee als boeking.

   Deze lijst stond eerder op alleen "niet beschikbaar" en "vol", en ving
   daardoor "Bezet", "Agenda dicht" en "Schoonmaken" niet. De drie
   twijfelgevallen - "content ochtend", "prive event", "innershift day retreat"
   - heeft Angela zelf aangewezen als dichtzetten.

   Nagelopen tegen alle regels die er stonden: deze woorden vangen precies de
   acht bedoelde regels en geen enkele echte boeking. Dat laatste is het risico:
   de naam van een gast staat bij deze regels in de titel, dus een te ruim woord
   maakt een boeking onzichtbaar.

   LET OP: dezelfde lijst staat in bwf-kalender.js (DICHT), die bepaalt hoe het
   in de agenda getoond wordt. Pas ze samen aan. */
const DICHT =
  /niet\s*besch|nietbesch|\bbezet\b|\bvol\b|gesloten|agenda\s*dicht|schoonma|onderhoud|geblokkeerd|blokkade|blokkering|niet\s*boekbaar|content|\bevent\b|retreat|fotoshoot|\bshoot\b|opname/i;

function verwerkSuite(suite: string, feeds: Record<string, Ev[]>, blokken: Tijdsblok[]) {
  const res: Record<string, Rij[]> = { smg: [], booking: [], oo: [] };
  const blk: Record<string, Rij[]> = { smg: [], booking: [], oo: [] };
  const telling = { samengevoegd: 0, smg_blokkade_vervallen: 0, booking_bezet_via_ander: 0, overgeslagen: 0 };
  const overnacht = blokken.find((b) => b.suite === suite && b.type === "overnachting");

  // SMG indelen: echte boeking (reserveringsnummer), blokkade-regel of overige handmatige regel
  const smgEcht: Ev[] = [], smgRegels: Ev[] = [], smgBlok: Ev[] = [];
  for (const ev of feeds.smg ?? []) {
    if (ev.status === "CANCELLED" || lokaal(ev.eind) <= lokaal(ev.start)) { telling.overgeslagen++; continue; }
    if (veld(ev.description, "Reserveringsnummer")) smgEcht.push(ev);
    else if (DICHT.test(ev.summary)) smgBlok.push(ev);
    else smgRegels.push(ev);
  }
  const gebruikt = new Set<Ev>();

  // Booking.com en Origineel Overnachten (alleen datums).
  // Besluit 11-09-2026: een Booking.com-sluiting op een nacht die al via OO of als SMG-boeking bezet is,
  // is geen tweede gast maar een sluiting → blokkade. Daarom OO eerst, en overlap controleren.
  const ooBezet = (feeds.oo ?? []).filter((ev) => ev.status !== "CANCELLED" && nachten(ev.start.datum, ev.eind.datum) >= 1);
  const bezetDoorAnder = (ev: Ev) => [...ooBezet, ...smgEcht].some((o) =>
    (o.start.datum >= ev.start.datum && o.start.datum < ev.eind.datum) ||
    (o.start.datum < ev.start.datum && o.eind.datum > ev.start.datum));
  for (const feed of ["oo", "booking"]) {
    for (const ev of feeds[feed] ?? []) {
      const n = nachten(ev.start.datum, ev.eind.datum);
      if (ev.status === "CANCELLED" || n < 1) { telling.overgeslagen++; continue; }
      if (feed === "booking" && (n > MAX_NACHTEN_BOOKING || bezetDoorAnder(ev))) {
        const bezet = n <= MAX_NACHTEN_BOOKING;
        if (bezet) telling.booking_bezet_via_ander++;
        blk.booking.push({
          bron_uid: ev.uid,
          van_lokaal: `${ev.start.datum} 00:00`,
          tot_lokaal: `${ev.eind.datum} 00:00`,
          reden: `Booking.com: ${ev.summary}${bezet ? " (nacht bezet via OO/SMG)" : ""}`,
        });
        continue;
      }
      // samenvoegen met een handmatige SMG-regel die binnen de nachten begint
      const binnen = (s: Ev) => !gebruikt.has(s) && s.start.datum >= ev.start.datum && s.start.datum < ev.eind.datum;
      const regel = smgRegels.filter(binnen).sort((a, b) => lokaal(a.start).localeCompare(lokaal(b.start)))[0];
      for (const s of smgBlok.filter(binnen)) { gebruikt.add(s); telling.smg_blokkade_vervallen++; }

      let start: Moment, eind: Moment, opmerking: string | null = null;
      if (regel) {
        gebruikt.add(regel);
        telling.samengevoegd++;
        start = regel.start;
        eind = regel.eind;
        opmerking = "samengevoegd met SMG-planningregel";
      } else if (overnacht) {
        start = { datum: ev.start.datum, tijd: hhmm(overnacht.begin) };
        eind = { datum: ev.eind.datum, tijd: hhmm(overnacht.eind) };
      } else {
        start = ev.start;
        eind = ev.eind;
        opmerking = "geen overnachtingsblok voor deze suite";
      }
      const naam = feed === "oo" && ev.summary.includes(" - ")
        ? splitsNaam(ev.summary.split(" - ").slice(1).join(" - "))
        : { voornaam: null, achternaam: null };
      res[feed].push(reservering(blokken, suite, feed, ev.uid, ev.uid, start, eind, {
        gast_voornaam: naam.voornaam,
        gast_achternaam: naam.achternaam,
        brongegevens: [ev.summary, regel ? `SMG-planning: ${regel.summary}` : ""].filter(Boolean).join("\n") || null,
        import_opmerking: opmerking,
      }));
    }
  }

  // Echte SMG-boekingen
  for (const ev of smgEcht) {
    const nummer = (veld(ev.description, "Reserveringsnummer") ?? "").replace(/\D/g, "") || ev.uid;
    const naam = splitsNaam(ev.summary);
    const personen = parseInt(veld(ev.description, "Aantal personen") ?? "", 10);
    res.smg.push(reservering(blokken, suite, "smg", nummer, ev.uid, ev.start, ev.eind, {
      gast_voornaam: naam.voornaam,
      gast_achternaam: naam.achternaam,
      gast_email: veld(ev.description, "E-mail"),
      gast_telefoon: veld(ev.description, "Tel"),
      personen: Number.isFinite(personen) ? personen : null,
      brongegevens: `${ev.summary}\n${ev.description}`,
    }));
  }

  /* SMG geeft handmatige planningsregels bij elke download een nieuwe UID (zie logboek 11-09-2026).
     Daarom een vaste sleutel uit suite + begin + eind; bij regels met exact dezelfde tijden volgt #2, #3
     op volgorde van de titel. Dezelfde opbouw staat in migratie 20260911140100_fase2_dubbele_opruimen.sql. */
  function vasteSleutels(evs: Ev[], soort: string): Map<Ev, string> {
    const stempel = (m: Moment) => m.datum.replace(/-/g, "") + m.tijd.replace(":", "");
    const volgorde = (e: Ev) => `${stempel(e.start)}|${stempel(e.eind)}|${e.summary}`;
    const sleutels = new Map<Ev, string>();
    const teller: Record<string, number> = {};
    const gesorteerd = [...evs].sort((a, b) => (volgorde(a) < volgorde(b) ? -1 : volgorde(a) > volgorde(b) ? 1 : 0));
    for (const ev of gesorteerd) {
      const basis = `${soort}:${suite}:${stempel(ev.start)}-${stempel(ev.eind)}`;
      teller[basis] = (teller[basis] ?? 0) + 1;
      sleutels.set(ev, teller[basis] === 1 ? basis : `${basis}#${teller[basis]}`);
    }
    return sleutels;
  }

  // Overige handmatige SMG-regels: kanaal uit de titel
  const regelSleutels = vasteSleutels(smgRegels.filter((ev) => !gebruikt.has(ev)), "smg-regel");
  for (const [ev, sleutel] of regelSleutels) {
    const t = ev.summary.toLowerCase();
    const kanaal = t.includes("booking") ? "booking" : t.includes("origineel") ? "oo" : t.includes("planyo") ? "planyo" : "handmatig";
    res.smg.push(reservering(blokken, suite, kanaal, sleutel, sleutel, ev.start, ev.eind, {
      brongegevens: ev.summary || null,
      import_opmerking: "handmatige regel in de SMG-planning",
    }));
  }

  // "Niet beschikbaar" / "Vol" zonder overlappende Booking.com/OO-boeking → blokkade
  const blokSleutels = vasteSleutels(smgBlok.filter((ev) => !gebruikt.has(ev)), "smg-blok");
  for (const [ev, sleutel] of blokSleutels) {
    blk.smg.push({ bron_uid: sleutel, van_lokaal: lokaal(ev.start), tot_lokaal: lokaal(ev.eind), reden: ev.summary || "SMG: niet beschikbaar" });
  }

  return { res, blk, telling };
}

/* Samenvatting voor ?proef=1 — alleen aantallen en tijden, geen namen. */
function samenvatting(uitkomst: ReturnType<typeof verwerkSuite>, aantallen: Record<string, number>, onleesbaar: Record<string, number>) {
  const uit: Rij = { ...uitkomst.telling };
  for (const feed of FEEDS) {
    if (!(feed in aantallen)) continue;
    const perSoort: Record<string, number> = {};
    const opmerkingen: Record<string, number> = {};
    for (const r of uitkomst.res[feed]) {
      perSoort[`${r.kanaal}/${r.type}`] = (perSoort[`${r.kanaal}/${r.type}`] ?? 0) + 1;
      if (r.import_opmerking) opmerkingen[r.import_opmerking] = (opmerkingen[r.import_opmerking] ?? 0) + 1;
    }
    uit[feed] = {
      events: aantallen[feed],
      onleesbaar: onleesbaar[feed],
      reserveringen: uitkomst.res[feed].length,
      per_kanaal_type: perSoort,
      met_tijdsblok: uitkomst.res[feed].filter((r) => r.tijdsblok_id).length,
      blokkades: uitkomst.blk[feed].length,
      opmerkingen,
    };
  }
  return uit;
}

/* ---------- Planyo ---------- */

/* Planyo is de vierde bron (kanaal 'planyo'), naast de drie ICS-feeds. Opdracht Angela, 12-10-2026
   (OPDRACHT-PLANYO-EN-BEDRAGEN.md). Anders dan de ICS-feeds geeft Planyo gast, bedragen en een vast nummer.

   De regels zijn hier strenger dan bij de ICS-feeds:
   - bestaat de boeking al (zelfde Planyo-nummer, of zelfde kanaal + nummer), dan wordt alleen aangevuld wat
     leeg is, en niets als iemand de reservering met de hand heeft gewijzigd;
   - staat er op dezelfde suite al een andere reservering met overlappende tijd, dan is het een CONFLICT:
     er wordt niets geschreven en het wordt gemeld. Zo komt een Privésauna-blok of een eerder ingevoerde
     Booking.com-boeking nooit dubbel te staan, ook niet als de herkenning hieronder hem mist.

   Proefrun (leest alleen): ?proef=1&planyo=1, met &alleen=planyo zonder de ICS-feeds.
   Met PLANYO_SCHRIJVEN aan loopt Planyo in elke gewone run mee, na de ICS-feeds. */
const PLANYO_API = "https://www.planyo.com/rest/";
const PLANYO_SCHRIJVEN = true; // aangezet 12-10-2026 na akkoord van Angela op de proefrun
const PLANYO_DAGEN_TERUG = 3;

/* Planyo geeft de status als optelsom van bits: 4 = bevestigd, 8 = geannuleerd door ons,
   16 = geannuleerd door de gast, 512 = automatisch geannuleerd (gezien: 9 en 521 zijn geannuleerd). */
const PLANYO_GEANNULEERD = 8 | 16 | 512;
const PLANYO_BEVESTIGD = 4;

/* Geeft de bron geen tijd (dag-accommodatie in Planyo), dan gelden deze tijden per suite
   (Angela, 02-10-2026). */
const STANDAARD_NACHT: Record<string, [string, string]> = {
  angie: ["19:00", "11:00"],
  malina_jacuzzi: ["20:00", "10:00"],
  malina_deluxe: ["19:00", "11:00"],
};

/* Planyo heeft per suite meerdere accommodaties (overnachting, dagverblijf); de naam zegt welke suite. */
function planyoSuite(naam: string): string | null {
  const t = naam.toLowerCase();
  if (t.includes("angie")) return "angie";
  if (t.includes("jacuzzi")) return "malina_jacuzzi";
  if (t.includes("zwembad") || t.includes("deluxe")) return "malina_deluxe";
  return null;
}

/* "2026-11-08 10:59:59" → 8 nov 11:00. Planyo laat een blok één seconde voor het hele uur eindigen. */
function planyoMoment(waarde: string): Moment | null {
  const m = waarde.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)));
  if (d.getUTCSeconds() === 59) d.setUTCSeconds(60);
  const iso = d.toISOString();
  return { datum: iso.slice(0, 10), tijd: iso.slice(11, 16) };
}

/* Een tijdstip uit de database als lokale tijd in Amsterdam, in dezelfde vorm als lokaal(). */
function lokaalUitDb(waarde: string): string {
  const p: Record<string, string> = {};
  for (const x of amsterdam.formatToParts(new Date(waarde))) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

async function planyoVraag(method: string, extra: Record<string, string>): Promise<Rij> {
  const sleutel = Deno.env.get("PLANYO_API_KEY") ?? "";
  if (!sleutel) throw new Error("secret PLANYO_API_KEY ontbreekt");
  const params = new URLSearchParams({ method, api_key: sleutel, language: "NL", ...extra });
  const r = await fetch(`${PLANYO_API}?${params.toString()}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(25000),
  });
  let data: Rij;
  try { data = JSON.parse(await r.text()); } catch { throw new Error("Planyo gaf geen geldig antwoord"); }
  // response_code 0 = gelukt; elke andere code is een fout
  const code = data.response_code === undefined ? 0 : Number(data.response_code);
  if (!r.ok || code !== 0) {
    throw new Error(`Planyo ${method}: ${String(data.response_message ?? `code ${code}`).slice(0, 200)}`);
  }
  return (data.data && typeof data.data === "object" && !Array.isArray(data.data)) ? data.data : data;
}

async function planyoReserveringen(): Promise<Rij[]> {
  const vanaf = new Date(Date.now() - PLANYO_DAGEN_TERUG * 86400000).toISOString().slice(0, 10);
  const tot = new Date(Date.now() + 730 * 86400000).toISOString().slice(0, 10);
  const alle: Rij[] = [];
  for (let page = 0; page < 20; page++) {
    const data = await planyoVraag("list_reservations", {
      start_time: `${vanaf} 00:00`,
      end_time: `${tot} 23:59`,
      detail_level: "7",
      page: String(page),
    });
    const rijen: Rij[] = Array.isArray(data.results) ? data.results : Array.isArray(data.reservations) ? data.reservations : [];
    alle.push(...rijen);
    if (rijen.length < 500) break;
  }
  return alle;
}

const leeg = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
const geenBedrag = (v: unknown) => leeg(v) || Number(v) === 0;
const euro = (v: unknown) => Math.round(Number(v || 0) * 100) / 100;

/* Alle tekst van een Planyo-regel behalve de naam van de accommodatie, om het kanaal aan te herkennen. */
function planyoTekst(r: Rij): string {
  const delen: string[] = [];
  const loop = (v: unknown, sleutel = "") => {
    if (sleutel === "name") return;
    if (typeof v === "string") delen.push(v);
    else if (v && typeof v === "object") for (const [k, w] of Object.entries(v)) loop(w, k);
  };
  loop(r);
  return delen.join("\n");
}

/* Zet één Planyo-regel om naar wat het dashboard ervan zou maken. Schrijft niets. */
function planyoRegel(r: Rij, blokken: Tijdsblok[]): Rij {
  const id = String(r.reservation_id ?? "").trim();
  const status = Number(r.status ?? 0);
  const tekst = planyoTekst(r);
  const basis: Rij = { planyo_id: id, planyo_status: status, accommodatie: String(r.name ?? "") };
  const suite = planyoSuite(String(r.name ?? ""));
  if (!/^\d+$/.test(id)) return { ...basis, soort: "overslaan", reden: "geen Planyo-nummer" };
  if (!suite) return { ...basis, soort: "overslaan", reden: "onbekende accommodatie" };

  let start = planyoMoment(String(r.start_time ?? ""));
  let eind = planyoMoment(String(r.end_time ?? ""));
  if (!start || !eind || lokaal(eind) <= lokaal(start)) return { ...basis, suite, soort: "overslaan", reden: "onleesbare tijden" };
  let opmerking: string | null = null;
  /* Een nacht-accommodatie komt als hele dagen: "15 juni 00:00 – 15 juni 23:59" is de nacht van
     15 op 16 juni. Het vertrek is dus de dag na de laatste nacht (gezien 13-10-2026, Planyo 20428202:
     die kwam binnen als dagverblijf van 00:00 tot 23:59). */
  if (start.tijd === "00:00" && eind.tijd === "23:59") {
    eind = { datum: new Date(Date.parse(`${eind.datum}T00:00:00Z`) + 86400000).toISOString().slice(0, 10), tijd: "00:00" };
  }
  if (start.tijd === "00:00" && eind.tijd === "00:00" && nachten(start.datum, eind.datum) >= 1) {
    const std = STANDAARD_NACHT[suite];
    start = { datum: start.datum, tijd: std[0] };
    eind = { datum: eind.datum, tijd: std[1] };
    opmerking = `Planyo geeft geen tijd; standaardtijd ${std[0]}–${std[1]}`;
  }
  basis.suite = suite;
  basis.van = lokaal(start);
  basis.tot = lokaal(eind);
  basis.geannuleerd = (status & PLANYO_GEANNULEERD) !== 0;

  if (/\[BWF-BLOKKADE\]/.test(tekst) || String(r.refcode ?? "") === "BWF-BLOKKADE") {
    return { ...basis, soort: "blokkade", reden: tekst.match(/\[BWF-BLOKKADE\]\s*([^\n]*)/)?.[1]?.trim() || "Niet beschikbaar" };
  }
  // Blokken uit de Privésauna-ICS-import: die boekingen staan al via de SMG-feed in het dashboard.
  if (/priv[eé]\s*sauna|special\s*moments|specialmoments|\bsmg\b|\bical\b|icalendar|\.ics\b/i.test(tekst)) {
    return { ...basis, soort: "overslaan", reden: "blok uit de Privésauna-agenda (staat al via de SMG-feed)" };
  }

  // Booking.com via de Planyo-XML: kanaal 'booking' met het Booking-reserveringsnummer.
  const isBooking = /booking\.com/i.test(tekst);
  const bookingNr = isBooking ? (tekst.match(/\b(\d{10})\b/)?.[1] ?? null) : null;
  const kanaal = isBooking ? "booking" : "planyo";
  const totaal = euro(r.total_price);
  const betaald = isBooking ? totaal : euro(r.amount_paid);
  const telefoon = String(r.mobile_number || "")
    ? (r.mobile_country_code ? `+${r.mobile_country_code}` : "") + r.mobile_number
    : (r.phone_country_code ? `+${r.phone_country_code}` : "") + String(r.phone || r.phone_number || "");
  const personen = parseInt(String(r.quantity ?? ""), 10);

  const rij = reservering(blokken, suite, kanaal, bookingNr ?? id, `planyo:${id}`, start, eind, {
    planyo_id: id,
    status: (status & PLANYO_BEVESTIGD) !== 0 || isBooking ? "bevestigd" : "optie",
    gast_voornaam: String(r.first_name ?? "").trim() || null,
    gast_achternaam: String(r.last_name ?? "").trim() || null,
    gast_email: String(r.email ?? "").trim() || null,
    gast_telefoon: telefoon.trim() || null,
    gast_adres: [r.address, r.zip, r.city, r.country].filter(Boolean).join(", ") || null,
    personen: Number.isFinite(personen) && personen > 0 ? personen : null,
    bedrag_totaal: totaal > 0 ? totaal : null,
    betaald_bedrag: totaal > 0 ? betaald : null,
    restant_bedrag: totaal > 0 ? euro(totaal - betaald) : null,
    betaalstatus: totaal > 0 ? (betaald >= totaal ? "betaald" : betaald > 0 ? "deels" : "open") : null,
    betaald_via: isBooking ? "Booking.com" : null,
    bedrag_bron: totaal > 0 ? "planyo" : null,
    brongegevens: `Planyo ${id} · ${String(r.name ?? "")}`,
    import_opmerking: [opmerking, isBooking && !bookingNr ? "Booking.com via Planyo zonder Booking-nummer" : null]
      .filter(Boolean).join("; ") || null,
  });
  return { ...basis, soort: "reservering", kanaal, kanaal_ref: rij.kanaal_ref, rij };
}

const AANVULBAAR = ["gast_voornaam", "gast_achternaam", "gast_email", "gast_telefoon", "gast_adres"];
const BEDRAGEN = ["bedrag_totaal", "betaald_bedrag", "restant_bedrag"];

/* Proefrun: wat zou er met elke Planyo-regel gebeuren? Leest alleen. Geen namen in de uitkomst. */
async function planyoProef(blokken: Tijdsblok[]): Promise<Rij> {
  const ruw = await planyoReserveringen();
  const regels = ruw.map((r) => ({ r, p: planyoRegel(r, blokken) }));

  const kolommen = "id,suite,kanaal,kanaal_ref,planyo_id,status,aankomst,vertrek,personen,bron_feed,aangemaakt_door," +
    "handmatig_gewijzigd_op,bedrag_bron," + [...AANVULBAAR, ...BEDRAGEN].join(",");
  const vanaf = new Date(Date.now() - (PLANYO_DAGEN_TERUG + 30) * 86400000).toISOString();
  const lopend = (await rest(`reserveringen?select=${kolommen}&vertrek=gte.${vanaf}&limit=5000`)) as Rij[];
  const nummers = [...new Set(regels.flatMap(({ p }) => [p.planyo_id, p.kanaal_ref]).filter((n) => /^\d+$/.test(String(n ?? ""))))];
  const opNummer = nummers.length
    ? (await rest(`reserveringen?select=${kolommen}&or=(planyo_id.in.(${nummers.join(",")}),kanaal_ref.in.(${nummers.join(",")}))`)) as Rij[]
    : [];
  const bestaand = [...new Map([...lopend, ...opNummer].map((b) => [b.id, b])).values()];

  const telling: Record<string, number> = { nieuw: 0, bestaat_al: 0, aangevuld: 0, conflict: 0, geannuleerd_in_planyo: 0, blokkade: 0, overgeslagen: 0 };
  const statussen: Record<string, number> = {};
  const uit: Rij[] = [];
  for (const { r, p } of regels) {
    statussen[String(p.planyo_status)] = (statussen[String(p.planyo_status)] ?? 0) + 1;
    const regel: Rij = {
      planyo_id: p.planyo_id, suite: p.suite ?? null, accommodatie: p.accommodatie, van: p.van ?? null, tot: p.tot ?? null,
      gast: `${String(r.first_name ?? "").trim().slice(0, 1)}.${String(r.last_name ?? "").trim().slice(0, 1)}.`,
      totaal: euro(r.total_price), betaald: euro(r.amount_paid), planyo_status: p.planyo_status,
    };
    const meld = (uitkomst: string, toelichting: string, extra: Rij = {}) => {
      telling[uitkomst]++;
      uit.push({ ...regel, ...extra, uitkomst, toelichting });
    };

    if (p.soort === "overslaan") { meld("overgeslagen", p.reden); continue; }
    if (p.soort === "blokkade") { meld(p.geannuleerd ? "overgeslagen" : "blokkade", p.geannuleerd ? "blokkade is in Planyo opgeheven" : p.reden); continue; }

    const zelfde = bestaand.find((b) => b.planyo_id === p.planyo_id) ??
      bestaand.find((b) => b.kanaal === p.kanaal && b.kanaal_ref === p.kanaal_ref) ??
      bestaand.find((b) => ["planyo", "eigen", "telefonisch", "whatsapp", "handmatig"].includes(b.kanaal) && b.kanaal_ref === p.planyo_id);
    const hier = zelfde ? { dashboard: `${zelfde.kanaal} ${zelfde.kanaal_ref ?? ""}`.trim(), dashboard_status: zelfde.status } : {};
    regel.kanaal = p.kanaal;

    if (p.geannuleerd) {
      if (!zelfde) meld("overgeslagen", "geannuleerd in Planyo en niet in het dashboard");
      else if (zelfde.status === "geannuleerd") meld("bestaat_al", "geannuleerd in Planyo en in het dashboard", hier);
      else meld("geannuleerd_in_planyo", "geannuleerd in Planyo, staat hier nog actief: nalopen (de import annuleert geen boeking met gast of bedrag)", hier);
      continue;
    }
    if (zelfde) {
      if (zelfde.handmatig_gewijzigd_op) { meld("bestaat_al", "met de hand gewijzigd: de import vult niets aan", hier); continue; }
      const velden = AANVULBAAR.filter((v) => leeg(zelfde[v]) && !leeg(p.rij[v]));
      if (leeg(zelfde.planyo_id)) velden.push("planyo_id");
      if (p.rij.bedrag_totaal !== null) {
        if (BEDRAGEN.every((v) => geenBedrag(zelfde[v]))) velden.push(...BEDRAGEN);
        else if (zelfde.bedrag_bron === "planyo" && BEDRAGEN.some((v) => euro(zelfde[v]) !== euro(p.rij[v]))) velden.push("bedragen bijgewerkt (eerder door de import gevuld)");
      }
      if (velden.length) meld("aangevuld", `vult aan: ${velden.join(", ")}`, hier);
      else meld("bestaat_al", "niets aan te vullen", hier);
      continue;
    }
    // Zelfde suite, overlappende tijd, ander nummer: niets schrijven en melden.
    const botsing = bestaand.filter((b) => b.suite === p.suite && b.status !== "geannuleerd" &&
      lokaalUitDb(b.aankomst) < p.tot && lokaalUitDb(b.vertrek) > p.van);
    if (botsing.length) {
      meld("conflict", "zelfde suite en overlappende tijd, ander nummer: er wordt niets geschreven", {
        botst_met: botsing.map((b) =>
          `${b.kanaal} ${b.kanaal_ref ?? b.id.slice(0, 8)} · ${lokaalUitDb(b.aankomst)} – ${lokaalUitDb(b.vertrek)} · ` +
          `${String(b.gast_voornaam ?? "").slice(0, 1)}.${String(b.gast_achternaam ?? "").slice(0, 1)}. · € ${euro(b.bedrag_totaal)}`),
      });
      continue;
    }
    meld("nieuw", [p.rij.status === "optie" ? "nog niet bevestigd in Planyo → optie" : null, p.rij.import_opmerking].filter(Boolean).join("; ") || "nieuwe reservering",
      { type: p.rij.type, met_tijdsblok: !!p.rij.tijdsblok_id });
  }

  return {
    schrijven: PLANYO_SCHRIJVEN,
    opgehaald: ruw.length,
    telling,
    planyo_statussen: statussen,
    // Welke velden Planyo meegeeft: nodig om de herkenning van Privésauna-blokken en Booking.com te toetsen.
    velden: [...new Set(ruw.flatMap((r) => Object.keys(r)))].sort(),
    regels: uit,
  };
}

/* Echte run: per suite door kanalen_verwerk (bron 'planyo'), dat zelf opnieuw controleert op bestaande
   boekingen en conflicten en niets schrijft bij twijfel (migratie 20261012190000). */
async function planyoSchrijf(blokken: Tijdsblok[], run: string): Promise<Rij> {
  const regels = (await planyoReserveringen()).map((r) => planyoRegel(r, blokken));
  const uit: Rij = { overgeslagen: regels.filter((p) => p.soort === "overslaan").length };
  for (const suite of [...new Set(regels.map((p) => p.suite).filter(Boolean))] as string[]) {
    const eigen = regels.filter((p) => p.suite === suite);
    try {
      uit[suite] = await verwerk({
        p_bron_feed: "planyo",
        p_suite: suite,
        p_run: run,
        p_reserveringen: eigen.filter((p) => p.soort === "reservering").map((p) => ({ ...p.rij, geannuleerd: p.geannuleerd })),
        p_blokkades: eigen.filter((p) => p.soort === "blokkade").map((p) => ({
          bron_uid: `planyo:${p.planyo_id}`, van_lokaal: p.van, tot_lokaal: p.tot, reden: p.reden, opgeheven: p.geannuleerd,
        })),
        p_events: eigen.length,
      });
    } catch (e) {
      uit[suite] = { fout: foutTekst(e) };
      await logFout(run, "planyo", suite, foutTekst(e));
    }
  }
  return uit;
}

/* ---------- aanroep ---------- */

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !SERVICE_KEY || !SYNC_TOKEN) {
    return antwoord({ fout: "Instellingen ontbreken (SUPABASE_URL, service role of KANALEN_SYNC_TOKEN)." }, 500);
  }
  if (!veiligGelijk(req.headers.get("x-sync-token") ?? "", SYNC_TOKEN)) {
    return antwoord({ fout: "Niet toegestaan." }, 401);
  }
  const vraag = new URL(req.url).searchParams;
  const proef = vraag.get("proef") === "1";
  // Proefrun van Planyo: ?proef=1&planyo=1. In een gewone run loopt Planyo mee als PLANYO_SCHRIJVEN aan staat.
  // &alleen=planyo slaat de ICS-feeds over.
  const metPlanyo = proef && vraag.get("planyo") === "1";
  const alleenPlanyo = vraag.get("alleen") === "planyo";
  if (alleenPlanyo && !metPlanyo) return antwoord({ fout: "alleen=planyo kan alleen met proef=1&planyo=1." }, 400);
  const run = new Date().toISOString();

  try {
    const blokken = (await rest("tijdsblokken?select=id,suite,type,begin,eind,volgende_dag&actief=eq.true")) as Tijdsblok[];
    const instellingen = alleenPlanyo ? [] : (await rest(
      "kanaal_instellingen?select=kanaal,suite,ics_secret&actief=eq.true&ics_secret=not.is.null",
    )) as Rij[];

    // Alle feeds tegelijk ophalen
    const opgehaald: Rij[] = await Promise.all(instellingen.map(async (i) => {
      const link = Deno.env.get(i.ics_secret);
      if (!link) return { i, fout: `secret ${i.ics_secret} ontbreekt` };
      try {
        const r = await fetch(link.replace(/^webcal:/i, "https:"), {
          headers: { "User-Agent": "BWF-kanalen-sync" },
          signal: AbortSignal.timeout(25000),
        });
        if (!r.ok) return { i, fout: `HTTP ${r.status}` };
        return { i, ...leesIcs(await r.text()) };
      } catch (e) {
        return { i, fout: foutTekst(e) };
      }
    }));

    const resultaat: Rij = {};
    for (const suite of [...new Set(instellingen.map((i) => i.suite))]) {
      const eigen = opgehaald.filter((o) => o.i.suite === suite);
      const mislukt = eigen.filter((o) => o.fout);
      if (mislukt.length) {
        // Niet alle feeds binnen: deze suite in deze run niet aanraken (voorkomt onterecht annuleren)
        resultaat[suite] = {
          overgeslagen: "niet alle feeds opgehaald; niets gewijzigd",
          fouten: Object.fromEntries(mislukt.map((o) => [o.i.kanaal, o.fout])),
        };
        if (!proef) for (const o of mislukt) await logFout(run, o.i.kanaal, suite, o.fout);
        continue;
      }

      const feeds: Record<string, Ev[]> = {};
      const aantallen: Record<string, number> = {};
      const onleesbaar: Record<string, number> = {};
      for (const o of eigen) {
        feeds[o.i.kanaal] = o.events;
        aantallen[o.i.kanaal] = o.events.length;
        onleesbaar[o.i.kanaal] = o.onleesbaar;
      }
      const uitkomst = verwerkSuite(suite, feeds, blokken);

      if (proef) {
        resultaat[suite] = samenvatting(uitkomst, aantallen, onleesbaar);
        continue;
      }

      const geschreven: Rij = {};
      for (const feed of FEEDS) {
        if (!(feed in feeds)) continue;
        try {
          geschreven[feed] = await verwerk({
            p_bron_feed: feed,
            p_suite: suite,
            p_run: run,
            p_reserveringen: uitkomst.res[feed],
            p_blokkades: uitkomst.blk[feed],
            p_events: aantallen[feed],
          });
        } catch (e) {
          geschreven[feed] = { fout: foutTekst(e) };
          await logFout(run, feed, suite, foutTekst(e));
        }
      }
      resultaat[suite] = { ...geschreven, ...uitkomst.telling };
    }

    let planyo: Rij | undefined;
    if (metPlanyo) {
      try { planyo = await planyoProef(blokken); } catch (e) { planyo = { fout: foutTekst(e) }; }
    } else if (!proef && PLANYO_SCHRIJVEN) {
      // Een fout bij Planyo mag de ICS-import hierboven niet onderuit halen.
      try { planyo = await planyoSchrijf(blokken, run); } catch (e) {
        planyo = { fout: foutTekst(e) };
        await logFout(run, "planyo", "-", foutTekst(e));
      }
    }

    // versie 6: Planyo als vierde bron (versie 5 was alleen de proefrun)
    return antwoord({ versie: 6, proef, run, suites: resultaat, ...(planyo ? { planyo } : {}) });
  } catch (e) {
    return antwoord({ fout: foutTekst(e) }, 500);
  }
});
