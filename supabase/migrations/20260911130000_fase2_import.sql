-- Fase 2 · migratie 5/6 — voorbereiding ICS-import (Edge Function kanalen-sync)
-- Voegt alleen toe: kolommen, een index, een logtabel en de verwerkfunctie.
-- Verwijdert niets. Reserveringen die uit hun feed verdwijnen krijgen status 'geannuleerd'
-- (alleen als de aankomst nog moet komen); blokkades gaan op actief = false.
begin;

-- reserveringen: uit welke feed, opmerkingen van de import, en of de import zelf annuleerde
alter table public.reserveringen
  add column if not exists bron_feed text check (bron_feed in ('smg', 'booking', 'oo')),
  add column if not exists import_opmerking text,
  add column if not exists geannuleerd_door_import boolean not null default false;

-- blokkades: laatst gezien in de feed, en actief of opgeheven
alter table public.blokkades
  add column if not exists feed_gezien_op timestamptz,
  add column if not exists actief boolean not null default true;
create unique index if not exists blokkades_bron_uid
  on public.blokkades (bron, suite, bron_uid) where bron_uid is not null;

-- logboek per feed per run (RLS aan zonder policies: alleen de service role)
create table if not exists public.kanalen_sync_log (
  id             bigint generated always as identity primary key,
  run_op         timestamptz not null,
  bron_feed      text not null,
  suite          text not null,
  gelukt         boolean not null,
  events         integer,
  reserveringen  integer,
  blokkades      integer,
  geannuleerd    integer,
  opgeheven      integer,
  fout           text,
  created_at     timestamptz not null default now()
);
alter table public.kanalen_sync_log enable row level security;

-- Verwerkt één feed van één suite. Aangeroepen door de Edge Function met de service role.
-- p_reserveringen: [{kanaal, kanaal_ref, bron_uid, type, tijdsblok_id, aankomst_lokaal, vertrek_lokaal,
--                    incheck_tijd, uitcheck_tijd, gast_voornaam, gast_achternaam, gast_email, gast_telefoon,
--                    personen, brongegevens, import_opmerking}]   (tijden lokaal, Europe/Amsterdam)
-- p_blokkades:     [{bron_uid, van_lokaal, tot_lokaal, reden}]
create or replace function public.kanalen_verwerk(
  p_bron_feed     text,
  p_suite         text,
  p_run           timestamptz,
  p_reserveringen jsonb,
  p_blokkades     jsonb,
  p_events        integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r          jsonb;
  v_aankomst timestamptz;
  v_vertrek  timestamptz;
  v_uitbet   date;
  v_res      integer := 0;
  v_blok     integer := 0;
  v_ann      integer := 0;
  v_op       integer := 0;
begin
  for r in select value from jsonb_array_elements(coalesce(p_reserveringen, '[]'::jsonb)) loop
    v_aankomst := (r->>'aankomst_lokaal')::timestamp at time zone 'Europe/Amsterdam';
    v_vertrek  := (r->>'vertrek_lokaal')::timestamp at time zone 'Europe/Amsterdam';
    v_uitbet   := null;
    select case k.uitbetaalregel
             when 'direct'              then (v_aankomst at time zone 'Europe/Amsterdam')::date
             when 'na_aankomst'         then (v_aankomst at time zone 'Europe/Amsterdam')::date + 1
             when 'dag7_volgende_maand' then (date_trunc('month', v_aankomst at time zone 'Europe/Amsterdam')
                                              + interval '1 month' + interval '6 days')::date
           end
      into v_uitbet
      from public.kanaal_instellingen k
     where k.kanaal = r->>'kanaal' and k.suite = p_suite;

    insert into public.reserveringen as t (
      suite, kanaal, kanaal_ref, bron_uid, bron_feed, feed_gezien_op, status, type, tijdsblok_id,
      aankomst, vertrek, incheck_tijd, uitcheck_tijd,
      gast_voornaam, gast_achternaam, gast_email, gast_telefoon, personen,
      brongegevens, uitbetaling_verwacht, import_opmerking, aangemaakt_door)
    values (
      p_suite, r->>'kanaal', r->>'kanaal_ref', r->>'bron_uid', p_bron_feed, p_run, 'bevestigd', r->>'type',
      nullif(r->>'tijdsblok_id', '')::uuid,
      v_aankomst, v_vertrek, nullif(r->>'incheck_tijd', '')::time, nullif(r->>'uitcheck_tijd', '')::time,
      nullif(r->>'gast_voornaam', ''), nullif(r->>'gast_achternaam', ''), nullif(r->>'gast_email', ''),
      nullif(r->>'gast_telefoon', ''), coalesce(nullif(r->>'personen', '')::integer, 2),
      nullif(r->>'brongegevens', ''), v_uitbet, nullif(r->>'import_opmerking', ''), 'kanalen-sync')
    on conflict (kanaal, kanaal_ref) do update set
      bron_uid                = excluded.bron_uid,
      bron_feed               = excluded.bron_feed,
      feed_gezien_op          = excluded.feed_gezien_op,
      type                    = excluded.type,
      tijdsblok_id            = excluded.tijdsblok_id,
      aankomst                = excluded.aankomst,
      vertrek                 = excluded.vertrek,
      incheck_tijd            = excluded.incheck_tijd,
      uitcheck_tijd           = excluded.uitcheck_tijd,
      uitbetaling_verwacht    = excluded.uitbetaling_verwacht,
      import_opmerking        = excluded.import_opmerking,
      -- handmatige aanvullingen blijven staan: alleen invullen wat nog leeg is
      gast_voornaam           = coalesce(t.gast_voornaam, excluded.gast_voornaam),
      gast_achternaam         = coalesce(t.gast_achternaam, excluded.gast_achternaam),
      gast_email              = coalesce(t.gast_email, excluded.gast_email),
      gast_telefoon           = coalesce(t.gast_telefoon, excluded.gast_telefoon),
      personen                = coalesce(nullif(r->>'personen', '')::integer, t.personen),
      brongegevens            = coalesce(t.brongegevens, excluded.brongegevens),
      -- door de import geannuleerd en weer in de feed: terug naar bevestigd
      status                  = case when t.geannuleerd_door_import then 'bevestigd' else t.status end,
      geannuleerd_door_import = false,
      gewijzigd_door          = 'kanalen-sync';
    v_res := v_res + 1;
  end loop;

  for r in select value from jsonb_array_elements(coalesce(p_blokkades, '[]'::jsonb)) loop
    insert into public.blokkades as b (suite, van, tot, reden, bron, bron_uid, feed_gezien_op, actief, aangemaakt_door)
    values (
      p_suite,
      (r->>'van_lokaal')::timestamp at time zone 'Europe/Amsterdam',
      (r->>'tot_lokaal')::timestamp at time zone 'Europe/Amsterdam',
      nullif(r->>'reden', ''), 'ics-' || p_bron_feed, r->>'bron_uid', p_run, true, 'kanalen-sync')
    on conflict (bron, suite, bron_uid) where bron_uid is not null do update set
      van            = excluded.van,
      tot            = excluded.tot,
      reden          = excluded.reden,
      feed_gezien_op = excluded.feed_gezien_op,
      actief         = true;
    v_blok := v_blok + 1;
  end loop;

  -- Niet meer in de feed en nog toekomstig: annuleren / opheffen. Een lege feed annuleert niets.
  if coalesce(p_events, 0) > 0 then
    update public.reserveringen
       set status = 'geannuleerd', geannuleerd_door_import = true, gewijzigd_door = 'kanalen-sync'
     where bron_feed = p_bron_feed and suite = p_suite
       and status <> 'geannuleerd'
       and (feed_gezien_op is null or feed_gezien_op < p_run)
       and aankomst >= now();
    get diagnostics v_ann = row_count;

    update public.blokkades
       set actief = false
     where bron = 'ics-' || p_bron_feed and suite = p_suite and actief
       and (feed_gezien_op is null or feed_gezien_op < p_run)
       and tot >= now();
    get diagnostics v_op = row_count;
  end if;

  insert into public.kanalen_sync_log (run_op, bron_feed, suite, gelukt, events, reserveringen, blokkades, geannuleerd, opgeheven)
  values (p_run, p_bron_feed, p_suite, true, p_events, v_res, v_blok, v_ann, v_op);

  return jsonb_build_object('reserveringen', v_res, 'blokkades', v_blok, 'geannuleerd', v_ann, 'opgeheven', v_op);
end
$$;

revoke all on function public.kanalen_verwerk(text, text, timestamptz, jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function public.kanalen_verwerk(text, text, timestamptz, jsonb, jsonb, integer) to service_role;

commit;
