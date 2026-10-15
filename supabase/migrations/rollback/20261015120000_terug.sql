-- Terugdraaien van 20261015120000_smg_mail_wacht_op_reservering.sql
-- Haalt de trigger en de nieuwe functies weg en zet smg_mail_verwerk() terug
-- naar de versie uit 20261012200000_smg_mail.sql. Verwijdert geen data:
-- bedragen die in de tussentijd zijn ingevuld blijven staan.
begin;

drop trigger if exists bwf_smg_mail_na_reservering on public.reserveringen;
drop function if exists public.bwf_smg_mail_na_reservering();
drop function if exists public.smg_mail_wachtende(text, boolean);

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

    if not p_proef and exists (select 1 from public.smg_mail_log l where l.mail_id = m->>'mail_id') then
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
          if not v_leeg and e.bedrag_totaal is distinct from v_totaal then
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
      on conflict (mail_id) do nothing;
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

commit;
