-- ===========================================================================
--  Gastberichten van Booking.com in het dashboard
--  Opdracht Angela, 13-10-2026: "kunnen de berichten en verzoeken ook in het
--  dashboard weergegeven worden" - "graag dit nu bouwen".
-- ===========================================================================
--  Booking.com stuurt elk bericht van een gast ("Kan ik om 15:00 inchecken?",
--  "2 year anniversary") alleen als e-mail, vanaf een @guest.booking.com-adres.
--  Een Google Apps Script stuurt die mails naar de Edge Function
--  gastberichten-mail; die leest nummer, naam en tekst en geeft ze door aan
--  gastberichten_verwerk() hieronder.
--
--  De regels:
--   - Er wordt NOOIT iets aan een reservering veranderd. Alleen de nieuwe tabel
--     gast_berichten wordt gevuld; de koppeling naar de reservering is een
--     verwijzing (reservering_id).
--   - Koppelen gaat op het Booking-nummer (kanaal_ref). Lukt dat niet - de
--     regel uit de Booking-agenda houdt soms zijn eigen nummer, zie migratie
--     20261013170000 - dan op suite + aankomstdag + naam van de gast. Alleen
--     als er precies één reservering past; bij twijfel blijft het bericht
--     ongekoppeld en staat het in het overzicht "Gastberichten".
--   - Elke mail één keer (mail_id is uniek). Opnieuw insturen kan geen kwaad.
--   - Ongekoppelde berichten worden bij elke nieuwe verwerking opnieuw
--     geprobeerd: komt de reservering later binnen, dan koppelt hij alsnog.
--   - Zien: wie de suite van het bericht mag zien (zelfde regel als bij de
--     reserveringen). Een bericht zonder suite zien alleen eigenaar en VR.
--   - Afvinken ("afgehandeld") gaat via gastbericht_afvinken(); iedereen die
--     het bericht ziet mag dat. Verder kan niemand vanuit de browser schrijven.
--
--  Voegt alleen toe (een tabel en drie functies). Verwijdert en wijzigt niets.
--  Terugdraaien: supabase/rollback/20261013210000_gastberichten_terug.sql
-- ===========================================================================

begin;

create table if not exists public.gast_berichten (
  id               bigint generated always as identity primary key,
  mail_id          text not null,
  ontvangen_op     timestamptz not null default now(),
  kanaal           text not null default 'booking',
  kanaal_ref       text,                         -- Booking-reserveringsnummer
  gast_naam        text,
  bericht          text not null,
  soort            text not null default 'bericht' check (soort in ('bericht', 'verzoek')),
  accommodatie     text,                         -- "Bed & Wellness Angie", zoals in de mail
  suite            text check (suite in ('angie', 'malina_jacuzzi', 'malina_deluxe')),
  aankomst_datum   date,
  antwoord_link    text,                         -- rechtstreeks naar het gesprek in de Extranet
  reservering_id   uuid references public.reserveringen(id) on delete set null,
  gekoppeld_via    text,                         -- 'nummer' | 'datum+naam' | 'datum+suite'
  status           text not null default 'open' check (status in ('open', 'afgehandeld')),
  afgehandeld_op   timestamptz,
  afgehandeld_door text,
  created_at       timestamptz not null default now()
);
create unique index if not exists gast_berichten_mail_id on public.gast_berichten (mail_id);
create index if not exists gast_berichten_reservering on public.gast_berichten (reservering_id);
create index if not exists gast_berichten_open on public.gast_berichten (status, ontvangen_op desc);
create index if not exists gast_berichten_ref on public.gast_berichten (kanaal_ref);

alter table public.gast_berichten enable row level security;

drop policy if exists "gastberichten lezen" on public.gast_berichten;
create policy "gastberichten lezen" on public.gast_berichten
  for select to authenticated
  using (
    case when suite is null
      then (select public.bwf_toegangsrol()) in ('eigenaar', 'vr')
      else public.bwf_mag_suite(suite)
    end
  );

revoke all on public.gast_berichten from anon;
revoke insert, update, delete on public.gast_berichten from authenticated;
grant select on public.gast_berichten to authenticated;

-- ---------------------------------------------------------------------------
--  Welke reservering hoort bij dit bericht? Geeft hooguit één regel terug.
-- ---------------------------------------------------------------------------
create or replace function public.gastbericht_zoek_reservering(
  p_nummer text,
  p_suite  text,
  p_datum  date,
  p_naam   text
)
returns table (reservering_id uuid, suite text, via text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_aantal integer;
  v_id     uuid;
  v_suite  text;
  v_naam   text := lower(btrim(coalesce(p_naam, '')));
begin
  -- 1. Op het Booking-nummer
  if coalesce(p_nummer, '') <> '' then
    select count(*), min(r.id::text)::uuid, min(r.suite)
      into v_aantal, v_id, v_suite
      from public.reserveringen r
     where r.kanaal_ref = p_nummer;
    if v_aantal = 1 then
      return query select v_id, v_suite, 'nummer'::text;
      return;
    end if;
  end if;

  if p_datum is null then return; end if;

  -- 2. Zelfde aankomstdag (en suite, als die bekend is) en dezelfde naam
  if v_naam <> '' then
    select count(*), min(r.id::text)::uuid, min(r.suite)
      into v_aantal, v_id, v_suite
      from public.reserveringen r
     where r.kanaal in ('booking', 'planyo')
       and r.status <> 'geannuleerd'
       and (r.aankomst at time zone 'Europe/Amsterdam')::date = p_datum
       and (p_suite is null or r.suite = p_suite)
       and (
         lower(btrim(concat_ws(' ', r.gast_voornaam, r.gast_achternaam))) = v_naam
         or (coalesce(r.gast_achternaam, '') <> '' and position(lower(r.gast_achternaam) in v_naam) > 0)
       );
    if v_aantal = 1 then
      return query select v_id, v_suite, 'datum+naam'::text;
      return;
    end if;
  end if;

  -- 3. Suite bekend en op die dag precies één Booking-regel zonder (andere) naam:
  --    een suite heeft per nacht maar één gast.
  if p_suite is not null then
    select count(*), min(r.id::text)::uuid, min(r.suite)
      into v_aantal, v_id, v_suite
      from public.reserveringen r
     where r.kanaal in ('booking', 'planyo')
       and r.status <> 'geannuleerd'
       and r.suite = p_suite
       and (r.aankomst at time zone 'Europe/Amsterdam')::date = p_datum;
    if v_aantal = 1 then
      -- alleen als er geen ándere gastnaam op staat
      if exists (
        select 1 from public.reserveringen r
         where r.id = v_id
           and (coalesce(r.gast_voornaam, '') = '' and coalesce(r.gast_achternaam, '') = '')
      ) then
        return query select v_id, v_suite, 'datum+suite'::text;
      end if;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
--  Berichten vastleggen. Alleen voor de Edge Function (service role).
--  p_proef = true: alles nalopen en teruggeven, niets schrijven.
-- ---------------------------------------------------------------------------
create or replace function public.gastberichten_verwerk(
  p_berichten jsonb,
  p_proef     boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m        jsonb;
  z        record;
  v_rid    uuid;
  v_rsuite text;
  v_via    text;
  v_suite  text;
  v_datum  date;
  v_uit    text;
  v_res    jsonb := '[]'::jsonb;
  v_later  integer := 0;
begin
  for m in select value from jsonb_array_elements(coalesce(p_berichten, '[]'::jsonb)) loop
    if coalesce(m->>'mail_id', '') = '' or coalesce(btrim(m->>'bericht'), '') = '' then
      v_res := v_res || jsonb_build_object('mail_id', m->>'mail_id', 'nummer', m->>'nummer',
        'uitkomst', 'onleesbaar', 'toelichting', 'geen mail-id of geen berichttekst');
      continue;
    end if;
    if exists (select 1 from public.gast_berichten g where g.mail_id = m->>'mail_id') then
      v_res := v_res || jsonb_build_object('mail_id', m->>'mail_id', 'nummer', m->>'nummer', 'uitkomst', 'al_verwerkt');
      continue;
    end if;

    v_suite := nullif(m->>'suite', '');
    if v_suite not in ('angie', 'malina_jacuzzi', 'malina_deluxe') then v_suite := null; end if;
    v_datum := case when coalesce(m->>'aankomst_datum', '') ~ '^\d{4}-\d{2}-\d{2}$'
                    then (m->>'aankomst_datum')::date end;

    v_rid := null; v_rsuite := null; v_via := null;
    select s.reservering_id, s.suite, s.via into v_rid, v_rsuite, v_via
      from public.gastbericht_zoek_reservering(
        nullif(m->>'nummer', ''), v_suite, v_datum, nullif(m->>'gast_naam', '')) s;
    v_uit := case when v_rid is not null then 'gekoppeld' else 'niet_gekoppeld' end;

    if not p_proef then
      insert into public.gast_berichten (
        mail_id, ontvangen_op, kanaal, kanaal_ref, gast_naam, bericht, soort,
        accommodatie, suite, aankomst_datum, antwoord_link, reservering_id, gekoppeld_via)
      values (
        m->>'mail_id',
        coalesce(nullif(m->>'ontvangen_op', '')::timestamptz, now()),
        'booking',
        nullif(m->>'nummer', ''),
        nullif(btrim(m->>'gast_naam'), ''),
        left(btrim(m->>'bericht'), 4000),
        case when m->>'soort' = 'verzoek' then 'verzoek' else 'bericht' end,
        nullif(btrim(m->>'accommodatie'), ''),
        coalesce(v_rsuite, v_suite),
        v_datum,
        nullif(m->>'antwoord_link', ''),
        v_rid,
        v_via)
      on conflict (mail_id) do nothing;
    end if;

    v_res := v_res || jsonb_build_object('mail_id', m->>'mail_id', 'nummer', m->>'nummer',
      'uitkomst', v_uit, 'gekoppeld_via', v_via, 'suite', coalesce(v_rsuite, v_suite),
      'aankomst', v_datum, 'soort', m->>'soort');
  end loop;

  -- Eerder ongekoppelde berichten opnieuw proberen (de reservering kan later
  -- binnen zijn gekomen). Alleen bij een echte verwerking.
  if not p_proef then
    for z in
      select g.id, s.reservering_id, s.suite, s.via
        from public.gast_berichten g
        cross join lateral public.gastbericht_zoek_reservering(g.kanaal_ref, g.suite, g.aankomst_datum, g.gast_naam) s
       where g.reservering_id is null
         and g.ontvangen_op > now() - interval '120 days'
    loop
      update public.gast_berichten g
         set reservering_id = z.reservering_id,
             suite          = coalesce(g.suite, z.suite),
             gekoppeld_via  = z.via
       where g.id = z.id and g.reservering_id is null;
      v_later := v_later + 1;
    end loop;
    if v_later > 0 then
      v_res := v_res || jsonb_build_object('uitkomst', 'later_gekoppeld', 'aantal', v_later);
    end if;
  end if;

  return v_res;
end;
$$;

-- ---------------------------------------------------------------------------
--  Afvinken vanuit het dashboard. Mag iedereen die het bericht kan zien.
-- ---------------------------------------------------------------------------
create or replace function public.gastbericht_afvinken(
  p_id          bigint,
  p_afgehandeld boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g      public.gast_berichten%rowtype;
  v_rol  text := public.bwf_toegangsrol();
  v_naam text;
begin
  if v_rol is null then raise exception 'Geen toegang.'; end if;
  select * into g from public.gast_berichten b where b.id = p_id for update;
  if not found then raise exception 'Bericht niet gevonden.'; end if;
  if not (case when g.suite is null then v_rol in ('eigenaar', 'vr') else public.bwf_mag_suite(g.suite) end) then
    raise exception 'Geen toegang tot dit bericht.';
  end if;
  select m.naam into v_naam from public.wz_medewerkers m where m.auth_id = auth.uid() limit 1;

  update public.gast_berichten b set
    status           = case when p_afgehandeld then 'afgehandeld' else 'open' end,
    afgehandeld_op   = case when p_afgehandeld then now() else null end,
    afgehandeld_door = case when p_afgehandeld then coalesce(v_naam, v_rol) else null end
   where b.id = p_id;

  return jsonb_build_object('id', p_id, 'status', case when p_afgehandeld then 'afgehandeld' else 'open' end);
end;
$$;

revoke all on function public.gastbericht_zoek_reservering(text, text, date, text) from public, anon, authenticated;
revoke all on function public.gastberichten_verwerk(jsonb, boolean) from public, anon, authenticated;
revoke all on function public.gastbericht_afvinken(bigint, boolean) from public, anon;
grant execute on function public.gastbericht_zoek_reservering(text, text, date, text) to service_role;
grant execute on function public.gastberichten_verwerk(jsonb, boolean) to service_role;
grant execute on function public.gastbericht_afvinken(bigint, boolean) to authenticated, service_role;

commit;
