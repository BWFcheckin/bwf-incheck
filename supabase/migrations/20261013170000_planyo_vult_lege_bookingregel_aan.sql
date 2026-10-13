-- ===========================================================================
--  Planyo-import: een lege Booking.com-regel aanvullen in plaats van een conflict
--  Akkoord Angela, 13-10-2026 ("ja, aanvullen")
-- ===========================================================================
--  Booking.com loopt sinds 12-10-2026 via Planyo (channel manager). Zolang de
--  oude Booking-agenda ook nog wordt ingelezen, zet die voor een nieuwe boeking
--  een regel zonder naam en zonder bedrag neer. Planyo geeft dezelfde boeking
--  mét naam en bedrag; tot nu toe werd dat een conflict en bleef de regel leeg
--  (eerste geval: Planyo 20428977, Angie 22-23 oktober 2026).
--
--  Nieuw, en alleen dit: komt een Booking.com-boeking uit Planyo binnen en is
--  de enige overlappende regel op die suite een lege regel uit de Booking-feed
--  (zelfde aankomst- en vertrekdag, geen gast, geen bedrag, geen Planyo-nummer,
--  niet met de hand gewijzigd), dan wordt die regel aangevuld met gast, bedrag
--  en Planyo-nummer. Tijden, kanaal en nummer van de regel blijven staan.
--  In elk ander geval blijft het een conflict en wordt er niets geschreven.
--
--  De rest van de functie is letterlijk de versie van 12-10-2026.
-- ===========================================================================

begin;

create or replace function public.kanalen_verwerk_planyo(
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
  r           jsonb;
  b           public.reserveringen%rowtype;
  v_pid       text;
  v_aankomst  timestamptz;
  v_vertrek   timestamptz;
  v_totaal    numeric;
  v_betaald   numeric;
  v_uitbet    date;
  v_status    text;
  v_gast      boolean;
  v_bedrag    boolean;
  v_bevestig  boolean;
  v_botst     text;
  v_n         integer;
  v_leeg      uuid;
  v_nieuw     integer := 0;
  v_aangevuld integer := 0;
  v_bestaat   integer := 0;
  v_ann       integer := 0;
  v_blok      integer := 0;
  v_op        integer := 0;
  v_meld      jsonb := '[]'::jsonb;
begin
  for r in select value from jsonb_array_elements(coalesce(p_reserveringen, '[]'::jsonb)) loop
    v_pid := nullif(r->>'planyo_id', '');
    if v_pid is null then continue; end if;
    v_aankomst := (r->>'aankomst_lokaal')::timestamp at time zone 'Europe/Amsterdam';
    v_vertrek  := (r->>'vertrek_lokaal')::timestamp at time zone 'Europe/Amsterdam';
    v_totaal   := nullif(r->>'bedrag_totaal', '')::numeric;
    v_betaald  := coalesce(nullif(r->>'betaald_bedrag', '')::numeric, 0);

    -- Staat deze boeking er al? Eerst op Planyo-nummer, dan op kanaal + nummer,
    -- dan een dashboardboeking die het Planyo-nummer als reserveringsnummer heeft.
    select t.* into b
      from public.reserveringen t
     where t.planyo_id = v_pid
        or (t.kanaal = r->>'kanaal' and t.kanaal_ref = r->>'kanaal_ref')
        or (t.kanaal in ('planyo', 'eigen', 'telefonisch', 'whatsapp', 'handmatig') and t.kanaal_ref = v_pid)
     order by (t.planyo_id is not distinct from v_pid) desc, (t.kanaal = r->>'kanaal') desc
     limit 1
       for update;

    if found then
      -- In Planyo geannuleerd
      if coalesce((r->>'geannuleerd')::boolean, false) then
        if b.status <> 'geannuleerd' then
          if b.bron_feed = 'planyo' and b.aangemaakt_door = 'kanalen-sync' then
            update public.reserveringen t
               set status = 'geannuleerd', geannuleerd_door_import = true
             where t.id = b.id
            returning t.status into v_status;
          else
            v_status := b.status;
          end if;
          if v_status = 'geannuleerd' then
            v_ann := v_ann + 1;
          else
            v_meld := v_meld || jsonb_build_object('soort', 'geannuleerd_in_planyo', 'planyo_id', v_pid,
              'reservering_id', b.id, 'toelichting', 'in Planyo geannuleerd, hier nog actief: nalopen');
          end if;
        end if;
        continue;
      end if;

      -- Met de hand gewijzigd: de import blijft eraf.
      if b.handmatig_gewijzigd_op is not null then
        v_bestaat := v_bestaat + 1;
        continue;
      end if;

      -- Datum, tijd of suite anders dan in Planyo: niet aanpassen, wel melden.
      if b.suite <> p_suite or b.aankomst <> v_aankomst or b.vertrek <> v_vertrek then
        v_meld := v_meld || jsonb_build_object('soort', 'wijkt_af', 'planyo_id', v_pid, 'reservering_id', b.id,
          'toelichting', 'suite, aankomst of vertrek is in Planyo anders dan in het dashboard: nalopen');
      end if;

      v_gast := (btrim(coalesce(b.gast_voornaam, ''))   = '' and nullif(r->>'gast_voornaam', '')   is not null)
             or (btrim(coalesce(b.gast_achternaam, '')) = '' and nullif(r->>'gast_achternaam', '') is not null)
             or (btrim(coalesce(b.gast_email, ''))      = '' and nullif(r->>'gast_email', '')      is not null)
             or (btrim(coalesce(b.gast_telefoon, ''))   = '' and nullif(r->>'gast_telefoon', '')   is not null)
             or (btrim(coalesce(b.gast_adres, ''))      = '' and nullif(r->>'gast_adres', '')      is not null)
             or b.planyo_id is null;
      -- Bedragen: alleen als alles nog leeg is, of als de import ze zelf had gevuld en er iets veranderd is.
      v_bedrag := v_totaal is not null and (
            (coalesce(b.bedrag_totaal, 0) = 0 and coalesce(b.betaald_bedrag, 0) = 0 and coalesce(b.restant_bedrag, 0) = 0)
         or (b.bedrag_bron = 'planyo' and (b.bedrag_totaal is distinct from v_totaal
                                        or coalesce(b.betaald_bedrag, 0) < v_betaald)));
      -- Een optie die deze import zelf aanmaakte en die in Planyo nu bevestigd is.
      v_bevestig := b.bron_feed = 'planyo' and b.status = 'optie' and r->>'status' = 'bevestigd';

      if v_gast or v_bedrag or v_bevestig then
        if v_bedrag then
          v_betaald := greatest(v_betaald, case when b.bedrag_bron = 'planyo' then coalesce(b.betaald_bedrag, 0) else 0 end);
        end if;
        update public.reserveringen t set
          planyo_id       = coalesce(t.planyo_id, v_pid),
          gast_voornaam   = case when btrim(coalesce(t.gast_voornaam, ''))   = '' then coalesce(nullif(r->>'gast_voornaam', ''),   t.gast_voornaam)   else t.gast_voornaam   end,
          gast_achternaam = case when btrim(coalesce(t.gast_achternaam, '')) = '' then coalesce(nullif(r->>'gast_achternaam', ''), t.gast_achternaam) else t.gast_achternaam end,
          gast_email      = case when btrim(coalesce(t.gast_email, ''))      = '' then coalesce(nullif(r->>'gast_email', ''),      t.gast_email)      else t.gast_email      end,
          gast_telefoon   = case when btrim(coalesce(t.gast_telefoon, ''))   = '' then coalesce(nullif(r->>'gast_telefoon', ''),   t.gast_telefoon)   else t.gast_telefoon   end,
          gast_adres      = case when btrim(coalesce(t.gast_adres, ''))      = '' then coalesce(nullif(r->>'gast_adres', ''),      t.gast_adres)      else t.gast_adres      end,
          bedrag_totaal   = case when v_bedrag then v_totaal else t.bedrag_totaal end,
          betaald_bedrag  = case when v_bedrag then v_betaald else t.betaald_bedrag end,
          restant_bedrag  = case when v_bedrag then greatest(v_totaal - v_betaald, 0) else t.restant_bedrag end,
          betaalstatus    = case when v_bedrag then case when v_betaald >= v_totaal then 'betaald' when v_betaald > 0 then 'deels' else 'open' end
                                 else t.betaalstatus end,
          betaald_via     = case when v_bedrag then coalesce(t.betaald_via, nullif(r->>'betaald_via', '')) else t.betaald_via end,
          bedrag_bron     = case when v_bedrag then 'planyo' else t.bedrag_bron end,
          status          = case when v_bevestig then 'bevestigd' else t.status end
        where t.id = b.id;
        v_aangevuld := v_aangevuld + 1;
      else
        v_bestaat := v_bestaat + 1;
      end if;
      continue;
    end if;

    -- Nog niet in het dashboard.
    if coalesce((r->>'geannuleerd')::boolean, false) then continue; end if;

    -- Booking.com via Planyo, terwijl de Booking-feed dezelfde nacht al als lege regel
    -- heeft gezet: dat is dezelfde boeking. Alleen als het de enige overlappende regel is,
    -- op dezelfde aankomst- en vertrekdag, zonder gast, zonder bedrag, zonder Planyo-nummer
    -- en niet met de hand gewijzigd. Tijden, kanaal en nummer van die regel blijven staan.
    if r->>'kanaal' = 'booking' then
      select count(*), (array_agg(t.id))[1]
        into v_n, v_leeg
        from public.reserveringen t
       where t.suite = p_suite and t.status <> 'geannuleerd'
         and t.aankomst < v_vertrek and t.vertrek > v_aankomst;
      if v_n = 1 then
        update public.reserveringen t set
          planyo_id       = v_pid,
          gast_voornaam   = nullif(r->>'gast_voornaam', ''),
          gast_achternaam = nullif(r->>'gast_achternaam', ''),
          gast_email      = coalesce(nullif(btrim(coalesce(t.gast_email, '')), ''),    nullif(r->>'gast_email', '')),
          gast_telefoon   = coalesce(nullif(btrim(coalesce(t.gast_telefoon, '')), ''), nullif(r->>'gast_telefoon', '')),
          gast_adres      = coalesce(nullif(btrim(coalesce(t.gast_adres, '')), ''),    nullif(r->>'gast_adres', '')),
          bedrag_totaal   = coalesce(v_totaal, t.bedrag_totaal),
          betaald_bedrag  = case when v_totaal is not null then v_betaald else t.betaald_bedrag end,
          restant_bedrag  = case when v_totaal is not null then greatest(v_totaal - v_betaald, 0) else t.restant_bedrag end,
          betaalstatus    = case when v_totaal is null then t.betaalstatus
                                 when v_betaald >= v_totaal then 'betaald' when v_betaald > 0 then 'deels' else 'open' end,
          betaald_via     = case when v_totaal is not null then coalesce(t.betaald_via, nullif(r->>'betaald_via', '')) else t.betaald_via end,
          bedrag_bron     = case when v_totaal is not null then 'planyo' else t.bedrag_bron end,
          brongegevens    = concat_ws(' · ', nullif(t.brongegevens, ''), nullif(r->>'brongegevens', ''))
        where t.id = v_leeg
          and t.kanaal = 'booking' and t.bron_feed = 'booking'
          and t.planyo_id is null and t.handmatig_gewijzigd_op is null
          and btrim(coalesce(t.gast_voornaam, '')) = '' and btrim(coalesce(t.gast_achternaam, '')) = ''
          and coalesce(t.bedrag_totaal, 0) = 0 and coalesce(t.betaald_bedrag, 0) = 0
          and (t.aankomst at time zone 'Europe/Amsterdam')::date = (v_aankomst at time zone 'Europe/Amsterdam')::date
          and (t.vertrek  at time zone 'Europe/Amsterdam')::date = (v_vertrek  at time zone 'Europe/Amsterdam')::date;
        if found then
          v_aangevuld := v_aangevuld + 1;
          continue;
        end if;
      end if;
    end if;

    -- Zelfde suite, overlappende tijd, ander nummer: niets schrijven, melden.
    select string_agg(t.kanaal || ' ' || coalesce(t.kanaal_ref, left(t.id::text, 8)), ', ')
      into v_botst
      from public.reserveringen t
     where t.suite = p_suite and t.status <> 'geannuleerd'
       and t.aankomst < v_vertrek and t.vertrek > v_aankomst;
    if v_botst is not null then
      v_meld := v_meld || jsonb_build_object('soort', 'conflict', 'planyo_id', v_pid, 'suite', p_suite,
        'aankomst', v_aankomst, 'vertrek', v_vertrek, 'botst_met', v_botst,
        'toelichting', 'zelfde suite en overlappende tijd, ander nummer: niets geschreven');
      continue;
    end if;

    v_uitbet := (v_aankomst at time zone 'Europe/Amsterdam')::date;
    select case k.uitbetaalregel
             when 'direct'              then (v_aankomst at time zone 'Europe/Amsterdam')::date
             when 'na_aankomst'         then (v_aankomst at time zone 'Europe/Amsterdam')::date + 1
             when 'dag7_volgende_maand' then (date_trunc('month', v_aankomst at time zone 'Europe/Amsterdam')
                                              + interval '1 month' + interval '6 days')::date
           end
      into v_uitbet
      from public.kanaal_instellingen k
     where k.kanaal = r->>'kanaal' and k.suite = p_suite;
    if not found then v_uitbet := (v_aankomst at time zone 'Europe/Amsterdam')::date; end if;

    insert into public.reserveringen (
      suite, kanaal, kanaal_ref, planyo_id, bron_uid, bron_feed, feed_gezien_op, status, type, tijdsblok_id,
      aankomst, vertrek, incheck_tijd, uitcheck_tijd,
      gast_voornaam, gast_achternaam, gast_email, gast_telefoon, gast_adres, personen,
      bedrag_totaal, betaald_bedrag, restant_bedrag, betaalstatus, betaald_via, bedrag_bron,
      brongegevens, uitbetaling_verwacht, import_opmerking, aangemaakt_door)
    values (
      p_suite, r->>'kanaal', r->>'kanaal_ref', v_pid, r->>'bron_uid', 'planyo', p_run,
      case when r->>'status' = 'optie' then 'optie' else 'bevestigd' end, r->>'type',
      nullif(r->>'tijdsblok_id', '')::uuid,
      v_aankomst, v_vertrek, nullif(r->>'incheck_tijd', '')::time, nullif(r->>'uitcheck_tijd', '')::time,
      nullif(r->>'gast_voornaam', ''), nullif(r->>'gast_achternaam', ''), nullif(r->>'gast_email', ''),
      nullif(r->>'gast_telefoon', ''), nullif(r->>'gast_adres', ''), coalesce(nullif(r->>'personen', '')::integer, 2),
      v_totaal,
      case when v_totaal is not null then v_betaald end,
      case when v_totaal is not null then greatest(v_totaal - v_betaald, 0) end,
      case when v_totaal is null then 'open' when v_betaald >= v_totaal then 'betaald' when v_betaald > 0 then 'deels' else 'open' end,
      nullif(r->>'betaald_via', ''),
      case when v_totaal is not null then 'planyo' end,
      nullif(r->>'brongegevens', ''), v_uitbet, nullif(r->>'import_opmerking', ''), 'kanalen-sync');
    v_nieuw := v_nieuw + 1;
  end loop;

  -- Blokkades uit het dashboard die in Planyo staan ([BWF-BLOKKADE]).
  for r in select value from jsonb_array_elements(coalesce(p_blokkades, '[]'::jsonb)) loop
    if coalesce((r->>'opgeheven')::boolean, false) then
      update public.blokkades
         set actief = false
       where bron = 'ics-planyo' and suite = p_suite and bron_uid = r->>'bron_uid' and actief;
      if found then v_op := v_op + 1; end if;
    else
      insert into public.blokkades as k (suite, van, tot, reden, bron, bron_uid, feed_gezien_op, actief, aangemaakt_door)
      values (
        p_suite,
        (r->>'van_lokaal')::timestamp at time zone 'Europe/Amsterdam',
        (r->>'tot_lokaal')::timestamp at time zone 'Europe/Amsterdam',
        nullif(r->>'reden', ''), 'ics-planyo', r->>'bron_uid', p_run, true, 'kanalen-sync')
      on conflict (bron, suite, bron_uid) where bron_uid is not null do update set
        van            = excluded.van,
        tot            = excluded.tot,
        reden          = excluded.reden,
        feed_gezien_op = excluded.feed_gezien_op,
        actief         = true;
      v_blok := v_blok + 1;
    end if;
  end loop;

  insert into public.kanalen_sync_log (run_op, bron_feed, suite, gelukt, events, reserveringen, blokkades, geannuleerd, opgeheven, conflicten)
  values (p_run, 'planyo', p_suite, true, p_events, v_nieuw + v_aangevuld + v_bestaat, v_blok, v_ann, v_op,
          case when jsonb_array_length(v_meld) > 0 then v_meld end);

  return jsonb_build_object('nieuw', v_nieuw, 'aangevuld', v_aangevuld, 'bestaat_al', v_bestaat,
                            'geannuleerd', v_ann, 'blokkades', v_blok, 'opgeheven', v_op, 'meldingen', v_meld);
end
$$;

revoke all on function public.kanalen_verwerk_planyo(text, timestamptz, jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function public.kanalen_verwerk_planyo(text, timestamptz, jsonb, jsonb, integer) to service_role;

commit;
