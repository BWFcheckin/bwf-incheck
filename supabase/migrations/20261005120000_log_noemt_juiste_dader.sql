-- ===========================================================================
--  Het wijzigingslog noemde de verkeerde dader - Angela, 05-10-2026
-- ===========================================================================
--  Wat er misging. In het log stond:
--
--    5 okt, 02:45 · Mollie — status: bevestigd → geannuleerd
--
--  Maar de Mollie-webhook schrijft nooit `status`; die raakt alleen
--  betaald_bedrag, restant_bedrag, betaalstatus, betaald_via en gewijzigd_door.
--  De echte schrijver was de import (kanalen_verwerk), die een boeking
--  annuleert zodra die niet meer in de feed staat.
--
--  De oorzaak van de verkeerde naam staat in deze functie zelf:
--
--    v_door := coalesce(nullif(new.gewijzigd_door, ''), ...)
--
--  `new.gewijzigd_door` is niet "wie schrijft er nu", maar "wat staat er in dat
--  veld na deze wijziging". Verandert een schrijver dat veld niet, dan blijft de
--  naam staan van wie het als laatste wél zette - hier "Mollie", van de betaling
--  een dag eerder. Sinds migratie 20260911140000 vult de import dat veld met
--  opzet niet meer, dus elke importwijziging erft sindsdien de vorige naam.
--
--  De reparatie: de naam uit het veld telt alleen als hij in DEZE wijziging is
--  meegestuurd. Anders valt hij terug op de ingelogde medewerker, en zonder
--  inlog op "import" - precies zoals het al bedoeld was.
--
--  Dit raakt alleen nieuwe logregels. Bestaande regels blijven zoals ze zijn;
--  er wordt niets verwijderd of herschreven.
-- ===========================================================================

begin;

create or replace function public.bwf_reservering_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_velden text[] := array[
    'gast_voornaam','gast_achternaam','gast_email','gast_telefoon','gast_adres','personen',
    'suite','aankomst','vertrek','incheck_tijd','uitcheck_tijd','type','tijdsblok_id','status',
    'bedrag_totaal','betaald_bedrag','restant_bedrag','betaalstatus','betaald_via','uitbetaling_verwacht',
    'arrangementen','extras','omschrijving','notitie','medewerker',
    'klant_id','checkin_id','welkomstcall_id','nachtregister_id',
    'borg_bedrag','borg_wijze','borg_ontvangen','borg_terug','borg_ingehouden','borg_afgehandeld','borg_notitie',
    'review_taak_id','review_verstuurd','gastlink_verstuurd','geannuleerd_op'
  ];
  v_veld  text;
  v_oud   text;
  v_nieuw text;
  v_door  text;
  v_oudj  jsonb := pg_catalog.to_jsonb(old);
  v_nieuwj jsonb := pg_catalog.to_jsonb(new);
begin
  v_door := coalesce(
    -- Alleen tellen als de schrijver de naam in DEZE wijziging heeft meegestuurd.
    -- Anders is het de naam van de vorige schrijver en wijst het log de
    -- verkeerde aan.
    case when new.gewijzigd_door is distinct from old.gewijzigd_door
         then pg_catalog.nullif(new.gewijzigd_door, '')
    end,
    (select m.naam from public.wz_medewerkers m where m.auth_id = auth.uid()),
    -- Geen ingelogde gebruiker = een achtergrondproces. Dat is de import of een
    -- Edge Function; die laatste zetten hun eigen naam wel mee.
    case when auth.uid() is null then 'import' else 'onbekend' end);

  foreach v_veld in array v_velden loop
    v_oud   := v_oudj   ->> v_veld;
    v_nieuw := v_nieuwj ->> v_veld;
    if v_oud is distinct from v_nieuw then
      insert into public.reservering_log (reservering_id, door, door_auth, veld, oud, nieuw)
      values (new.id, v_door, auth.uid(), v_veld, v_oud, v_nieuw);
    end if;
  end loop;
  return new;
end
$$;

commit;

-- ===========================================================================
--  CONTROLE
-- ===========================================================================
--  Werk een reservering bij via het scherm en kijk of je eigen naam in het log
--  komt. Daarna een importronde afwachten: die hoort nu "import" te noemen en
--  niet meer de naam van wie er als laatste iets betaalde.
--
-- select wanneer, door, veld, oud, nieuw
--   from public.reservering_log
--  order by wanneer desc
--  limit 20;
-- ===========================================================================
