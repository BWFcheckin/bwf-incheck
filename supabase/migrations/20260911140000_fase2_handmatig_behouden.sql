-- Fase 2 · migratie 7 — de import laat handmatig ingevulde gegevens met rust
-- Wens Angela 11-09-2026: wat Kelly (of een ander) in reservering-beheer.html invult, blijft staan.
-- - Nieuwe kolom handmatig_gewijzigd_op; een trigger vult die bij elke wijziging door een ingelogde gebruiker
--   (de import draait als service role, zonder ingelogde gebruiker, en telt dus niet mee).
-- - kanalen_verwerk(): bij een bestaande reservering altijd alleen aankomst, vertrek, status (annuleren/terugzetten),
--   uitbetaaldatum en feedgegevens bijwerken. Type, tijdsblok, afwijkende tijden, opmerking en personen alleen
--   zolang niemand de reservering handmatig heeft gewijzigd. Gastvelden en brongegevens alleen invullen als ze leeg zijn.
--   gewijzigd_door wordt door de import niet meer gevuld.
-- Verwijdert niets.
begin;

alter table public.reserveringen add column if not exists handmatig_gewijzigd_op timestamptz;

create or replace function public.bwf_reservering_handmatig()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.handmatig_gewijzigd_op := now();
    -- status handmatig gewijzigd: de import mag die niet meer terugzetten
    if new.status is distinct from old.status then
      new.geannuleerd_door_import := false;
    end if;
  end if;
  return new;
end
$$;

create or replace trigger reserveringen_handmatig
  before update on public.reserveringen
  for each row execute function public.bwf_reservering_handmatig();

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
      -- altijd: feedgegevens, tijden, uitbetaaldatum
      bron_uid                = excluded.bron_uid,
      bron_feed               = excluded.bron_feed,
      feed_gezien_op          = excluded.feed_gezien_op,
      aankomst                = excluded.aankomst,
      vertrek                 = excluded.vertrek,
      uitbetaling_verwacht    = excluded.uitbetaling_verwacht,
      -- alleen zolang niemand de reservering handmatig heeft gewijzigd
      type                    = case when t.handmatig_gewijzigd_op is null then excluded.type else t.type end,
      tijdsblok_id            = case when t.handmatig_gewijzigd_op is null then excluded.tijdsblok_id else t.tijdsblok_id end,
      incheck_tijd            = case when t.handmatig_gewijzigd_op is null then excluded.incheck_tijd else t.incheck_tijd end,
      uitcheck_tijd           = case when t.handmatig_gewijzigd_op is null then excluded.uitcheck_tijd else t.uitcheck_tijd end,
      import_opmerking        = case when t.handmatig_gewijzigd_op is null then excluded.import_opmerking else t.import_opmerking end,
      personen                = case when t.handmatig_gewijzigd_op is null
                                     then coalesce(nullif(r->>'personen', '')::integer, t.personen) else t.personen end,
      -- gastvelden en brongegevens: alleen invullen wat nog leeg is
      gast_voornaam           = coalesce(t.gast_voornaam, excluded.gast_voornaam),
      gast_achternaam         = coalesce(t.gast_achternaam, excluded.gast_achternaam),
      gast_email              = coalesce(t.gast_email, excluded.gast_email),
      gast_telefoon           = coalesce(t.gast_telefoon, excluded.gast_telefoon),
      brongegevens            = coalesce(t.brongegevens, excluded.brongegevens),
      -- door de import geannuleerd en weer in de feed: terug naar bevestigd
      status                  = case when t.geannuleerd_door_import then 'bevestigd' else t.status end,
      geannuleerd_door_import = false;
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
       set status = 'geannuleerd', geannuleerd_door_import = true
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
