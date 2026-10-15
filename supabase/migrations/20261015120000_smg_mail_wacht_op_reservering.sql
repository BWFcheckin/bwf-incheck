-- ===========================================================================
--  Privésauna (SMG): bedragen uit de mail ook invullen als de reservering
--  pas ná de mail in het dashboard komt
--  Probleem gemeld door Angela, 15-10-2026 (reservering 799845, Zakaria Chaoui)
-- ===========================================================================
--  Wat ging er mis:
--   De SMG-mail komt vaak binnen vóórdat de SMG-agendafeed de reservering in
--   het dashboard heeft gezet (feed elke 15 min, en SMG werkt de feed zelf ook
--   met vertraging bij). smg_mail_verwerk() logde dan 'onbekend_nummer', het
--   Google-script gaf de mail het label "SMG-verwerkt", en de mail werd nooit
--   meer geprobeerd: de bedragen bleven leeg.
--   Tweede gat: werd de reservering intussen met de hand aangeraakt (een vinkje,
--   de locatiemanager), dan telde hij als 'handmatig' en vulde de import ook
--   lege bedragen niet meer in.
--
--  Wat deze migratie doet:
--   1. smg_mail_verwerk():
--      - een mail met eerdere uitkomst 'onbekend_nummer' mag opnieuw worden
--        verwerkt (de logregel wordt dan bijgewerkt);
--      - bij een met de hand gewijzigde reservering waarvan de bedragen nog
--        helemaal leeg zijn, worden de bedragen wél ingevuld. Staat de
--        betaalstatus met de hand op iets anders dan 'open': conflict, niets
--        schrijven. Alle andere regels blijven precies gelijk.
--   2. Nieuwe functie smg_mail_wachtende(nummer, proef): verwerkt de mails die
--      nog op hun reservering wachten. Zonder nummer: alle wachtende mails
--      (voor het eenmalig inhalen, eerst als proefrun).
--   3. Trigger op reserveringen: zodra er een SMG-reservering bijkomt (of een
--      reservering kanaal smg + nummer krijgt), worden de wachtende mails voor
--      dat nummer meteen verwerkt. Een fout hierin blokkeert de reservering nooit.
--
--  Wordt niets overschreven: bedragen worden alleen ingevuld als ze leeg zijn,
--  of bijgewerkt als deze import ze zelf had gevuld (zoals voorheen).
--  Verwijdert niets, maakt geen reserveringen aan.
--  Terugdraaien: supabase/migrations/rollback/20261015120000_terug.sql
-- ===========================================================================

begin;

create or replace function public.smg_mail_verwerk(
  p_mails         jsonb,
  p_proef         boolean default true,
  p_nieuwe_velden boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m          jsonb;
  e          public.reserveringen%rowtype;
  v_nummer   text;
  v_datum    timestamptz;
  v_totaal   numeric;
  v_betaald  numeric;
  v_rest     numeric;
  v_service  numeric;
  v_arr      text;
  v_uit      text;
  v_toel     text;
  v_leeg     boolean;
  v_bedragen boolean;
  v_extra    boolean;
  v_res      jsonb := '[]'::jsonb;
begin
  for m in select value from jsonb_array_elements(coalesce(p_mails, '[]'::jsonb)) loop
    v_nummer  := nullif(m->>'nummer', '');
    v_datum   := nullif(m->>'mail_datum', '')::timestamptz;
    v_totaal  := nullif(m->>'totaal', '')::numeric;
    v_betaald := nullif(m->>'betaald', '')::numeric;
    v_rest    := nullif(m->>'te_betalen', '')::numeric;
    v_service := nullif(m->>'servicekosten', '')::numeric;
    v_arr     := nullif(m->>'arrangementen_tekst', '');
    v_uit := null; v_toel := null; v_bedragen := false; v_extra := false;
    e := null;

    -- Een mail die eerder alleen 'onbekend_nummer' opleverde (de reservering stond er toen nog niet)
    -- telt niet als verwerkt: die mag opnieuw (15-10-2026).
    if not p_proef and exists (select 1 from public.smg_mail_log l
                                where l.mail_id = m->>'mail_id' and l.uitkomst <> 'onbekend_nummer') then
      v_res := v_res || jsonb_build_object('mail_id', m->>'mail_id', 'nummer', v_nummer, 'uitkomst', 'al_verwerkt');
      continue;
    end if;

    if v_nummer is null or v_totaal is null or v_betaald is null or v_rest is null then
      v_uit := 'onleesbaar'; v_toel := 'nummer of bedragen niet gevonden in de mail';
    else
      select t.* into e from public.reserveringen t
       where t.kanaal = 'smg' and t.kanaal_ref = v_nummer
         for update;
      if not found then
        v_uit := 'onbekend_nummer'; v_toel := 'geen SMG-reservering met dit nummer; er wordt niets aangemaakt';
      else
        -- Staan de arrangementen al bij de reservering, dan komt de lijst uit de mail er niet nog eens
        -- naast (Angela, 12-10-2026: niet dubbel vermelden).
        if e.arrangementen is not null
           and e.arrangementen not in ('[]'::jsonb, '{}'::jsonb, 'null'::jsonb, '""'::jsonb) then
          v_arr := null;
        end if;
        v_leeg := coalesce(e.bedrag_totaal, 0) = 0 and coalesce(e.betaald_bedrag, 0) = 0 and coalesce(e.restant_bedrag, 0) = 0;
        v_extra := (e.servicekosten is null and v_service is not null)
                or (btrim(coalesce(e.arrangementen_tekst, '')) = '' and v_arr is not null);

        if e.bedrag_bron = 'smg-mail' and exists (
             select 1 from public.smg_mail_log l
              where l.nummer = v_nummer and l.mail_datum > v_datum and l.uitkomst in ('aangevuld', 'bijgewerkt')) then
          v_uit := 'ouder'; v_toel := 'er is al een nieuwere mail voor dit nummer verwerkt';
          v_extra := false;
        elsif e.handmatig_gewijzigd_op is not null then
          -- 15-10-2026: met de hand gewijzigd (bv. een vinkje of de locatiemanager gezet) maar de bedragen
          -- zijn nog helemaal leeg: dan wél invullen, er wordt niets overschreven. Behalve als iemand de
          -- betaalstatus al met de hand op iets anders dan 'open' heeft gezet: dan conflict, niets schrijven.
          if v_leeg and coalesce(e.betaalstatus, 'open') <> 'open' then
            v_uit := 'conflict'; v_extra := false;
            v_toel := 'bedragen leeg, maar de betaalstatus is met de hand op ' || e.betaalstatus || ' gezet: niets geschreven';
          elsif v_leeg then
            v_uit := 'aangevuld'; v_bedragen := true;
            v_toel := 'met de hand gewijzigd, maar de bedragen waren nog leeg: bedragen ingevuld';
          elsif e.bedrag_totaal is distinct from v_totaal then
            v_uit := 'conflict'; v_extra := false;
            v_toel := 'met de hand gewijzigd en het totaal wijkt af van de mail: niets geschreven';
          elsif v_extra and p_nieuwe_velden then
            v_uit := 'aangevuld'; v_toel := 'met de hand gewijzigd: alleen servicekosten/arrangementen aangevuld';
          else
            v_uit := 'handmatig'; v_extra := false;
            v_toel := 'met de hand gewijzigd: de import vult niets aan';
          end if;
        elsif v_leeg then
          v_uit := 'aangevuld'; v_bedragen := true; v_toel := 'bedragen ingevuld';
        elsif e.bedrag_bron = 'smg-mail' then
          if e.bedrag_totaal is distinct from v_totaal or e.betaald_bedrag is distinct from v_betaald
             or e.restant_bedrag is distinct from v_rest then
            v_uit := 'bijgewerkt'; v_bedragen := true; v_toel := 'nieuwere mail met andere bedragen (eerder door de import gevuld)';
          elsif v_extra then
            v_uit := 'aangevuld'; v_toel := 'servicekosten/arrangementen aangevuld';
          else
            v_uit := 'ongewijzigd'; v_toel := 'bedragen stonden er al';
          end if;
        elsif e.bedrag_totaal is distinct from v_totaal then
          v_uit := 'conflict'; v_extra := false;
          v_toel := 'er staat al een ander totaal dat niet van deze import komt: niets geschreven';
        elsif v_extra then
          v_uit := 'aangevuld'; v_toel := 'servicekosten/arrangementen aangevuld';
        else
          v_uit := 'ongewijzigd'; v_toel := 'bedragen stonden er al';
        end if;

        if not p_proef and (v_bedragen or (v_extra and v_uit = 'aangevuld')) then
          update public.reserveringen t set
            bedrag_totaal       = case when v_bedragen then v_totaal  else t.bedrag_totaal  end,
            betaald_bedrag      = case when v_bedragen then v_betaald else t.betaald_bedrag end,
            restant_bedrag      = case when v_bedragen then v_rest    else t.restant_bedrag end,
            betaalstatus        = case when v_bedragen then case when v_rest <= 0 then 'betaald' when v_betaald > 0 then 'deels' else 'open' end
                                       else t.betaalstatus end,
            bedrag_bron         = case when v_bedragen then 'smg-mail' else t.bedrag_bron end,
            servicekosten       = coalesce(t.servicekosten, v_service),
            arrangementen_tekst = case when btrim(coalesce(t.arrangementen_tekst, '')) = '' then coalesce(v_arr, t.arrangementen_tekst)
                                       else t.arrangementen_tekst end,
            gewijzigd_door      = 'smg-mail'
          where t.id = e.id;
        end if;
      end if;
    end if;

    if not p_proef then
      insert into public.smg_mail_log (mail_id, mail_datum, soort, nummer, uitkomst, toelichting, gegevens, reservering_id)
      values (m->>'mail_id', v_datum, m->>'soort', v_nummer, v_uit, v_toel,
              m - 'mail_id' || jsonb_build_object('dashboard_totaal', e.bedrag_totaal, 'dashboard_betaald', e.betaald_bedrag,
                                                   'dashboard_restant', e.restant_bedrag), e.id)
      on conflict (mail_id) do update set
        verwerkt_op    = now(),
        uitkomst       = excluded.uitkomst,
        toelichting    = excluded.toelichting,
        gegevens       = excluded.gegevens,
        reservering_id = excluded.reservering_id
      where public.smg_mail_log.uitkomst = 'onbekend_nummer';
    end if;

    v_res := v_res || jsonb_build_object(
      'mail_id', m->>'mail_id', 'nummer', v_nummer, 'soort', m->>'soort', 'uitkomst', v_uit, 'toelichting', v_toel,
      'suite', e.suite, 'aankomst', (e.aankomst at time zone 'Europe/Amsterdam')::date,
      'mail', jsonb_build_object('totaal', v_totaal, 'betaald', v_betaald, 'te_betalen', v_rest, 'servicekosten', v_service),
      'dashboard', case when e.id is not null then jsonb_build_object('totaal', e.bedrag_totaal, 'betaald', e.betaald_bedrag,
                        'restant', e.restant_bedrag, 'bron', e.bedrag_bron, 'handmatig', e.handmatig_gewijzigd_op is not null) end,
      'kan_extra', v_uit = 'handmatig' and ((e.servicekosten is null and v_service is not null)
                                         or (btrim(coalesce(e.arrangementen_tekst, '')) = '' and v_arr is not null)));
  end loop;
  return v_res;
end
$$;

-- ---------------------------------------------------------------------------
--  Wachtende mails (uitkomst 'onbekend_nummer') alsnog verwerken
-- ---------------------------------------------------------------------------
create or replace function public.smg_mail_wachtende(
  p_nummer text    default null,
  p_proef  boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mails jsonb;
begin
  -- De logregel bewaart de mail zonder mail_id en met drie dashboard_-velden erbij;
  -- hier wordt de oorspronkelijke mail weer opgebouwd. Oudste mail eerst, zodat een
  -- latere mail (bv. Bevestiging na Verhuur-oke) de bedragen kan bijwerken.
  select jsonb_agg(
           (l.gegevens - 'dashboard_totaal' - 'dashboard_betaald' - 'dashboard_restant')
             || jsonb_build_object('mail_id', l.mail_id)
           order by l.mail_datum nulls first, l.id)
    into v_mails
    from public.smg_mail_log l
   where l.uitkomst = 'onbekend_nummer'
     and l.gegevens is not null
     and (p_nummer is null or l.nummer = p_nummer)
     and exists (select 1 from public.reserveringen r
                  where r.kanaal = 'smg' and r.kanaal_ref = l.nummer);

  if v_mails is null then
    return '[]'::jsonb;
  end if;
  -- p_nieuwe_velden = true: besluit Angela 12-10-2026 (servicekosten/arrangementen mogen erbij).
  return public.smg_mail_verwerk(v_mails, p_proef, true);
end
$$;

revoke all on function public.smg_mail_wachtende(text, boolean) from public, anon, authenticated;
grant execute on function public.smg_mail_wachtende(text, boolean) to service_role;


-- ---------------------------------------------------------------------------
--  Trigger: nieuwe SMG-reservering -> wachtende mails meteen verwerken
-- ---------------------------------------------------------------------------
create or replace function public.bwf_smg_mail_na_reservering()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.smg_mail_wachtende(new.kanaal_ref, false);
  exception when others then
    -- Nooit de reservering zelf laten mislukken; de mail blijft wachten en kan
    -- later met smg_mail_wachtende() worden ingehaald.
    raise warning 'smg-mail voor reservering % niet verwerkt: %', new.kanaal_ref, sqlerrm;
  end;
  return null;
end
$$;

revoke all on function public.bwf_smg_mail_na_reservering() from public, anon, authenticated;

drop trigger if exists bwf_smg_mail_na_reservering on public.reserveringen;
create trigger bwf_smg_mail_na_reservering
  after insert or update of kanaal, kanaal_ref on public.reserveringen
  for each row
  when (new.kanaal = 'smg' and new.kanaal_ref is not null)
  execute function public.bwf_smg_mail_na_reservering();

commit;

-- ===========================================================================
--  NA HET UITVOEREN (in de SQL-editor van Supabase)
-- ===========================================================================
--  1. Proefrun: welke mails wachten er nog, en wat zou er gebeuren? (schrijft niets)
--
-- select x->>'nummer' as nummer, x->>'soort' as soort, x->>'uitkomst' as uitkomst,
--        x->>'toelichting' as toelichting, x->>'suite' as suite, x->>'aankomst' as aankomst,
--        x->'mail' as mail, x->'dashboard' as dashboard
--   from jsonb_array_elements(public.smg_mail_wachtende(null, true)) x
--  order by x->>'aankomst', x->>'nummer';
--
--  2. Na akkoord: echt verwerken (zelfde query, maar met false)
--
-- select x->>'nummer' as nummer, x->>'uitkomst' as uitkomst, x->>'toelichting' as toelichting
--   from jsonb_array_elements(public.smg_mail_wachtende(null, false)) x;
--
--  3. Controle 799845:
--
-- select kanaal_ref, bedrag_totaal, betaald_bedrag, restant_bedrag, servicekosten, betaalstatus, bedrag_bron
--   from public.reserveringen where kanaal = 'smg' and kanaal_ref = '799845';
-- ===========================================================================
