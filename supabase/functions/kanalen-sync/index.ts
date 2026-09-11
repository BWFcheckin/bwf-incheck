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
    else if (/niet beschikbaar|\bvol\b/i.test(ev.summary)) smgBlok.push(ev);
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

/* ---------- aanroep ---------- */

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !SERVICE_KEY || !SYNC_TOKEN) {
    return antwoord({ fout: "Instellingen ontbreken (SUPABASE_URL, service role of KANALEN_SYNC_TOKEN)." }, 500);
  }
  if (!veiligGelijk(req.headers.get("x-sync-token") ?? "", SYNC_TOKEN)) {
    return antwoord({ fout: "Niet toegestaan." }, 401);
  }
  const proef = new URL(req.url).searchParams.get("proef") === "1";
  const run = new Date().toISOString();

  try {
    const blokken = (await rest("tijdsblokken?select=id,suite,type,begin,eind,volgende_dag&actief=eq.true")) as Tijdsblok[];
    const instellingen = (await rest(
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
          geschreven[feed] = await rest("rpc/kanalen_verwerk", "POST", {
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

    return antwoord({ versie: 3, proef, run, suites: resultaat }); // versie 3: Booking.com-sluiting bij overlap met OO/SMG = blokkade
  } catch (e) {
    return antwoord({ fout: foutTekst(e) }, 500);
  }
});
