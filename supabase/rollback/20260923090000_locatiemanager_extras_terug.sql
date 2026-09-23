-- Terugdraaien van 20260923090000_locatiemanager_extras.sql
-- ---------------------------------------------------------------------------
-- Zet de rem terug zoals hij was: een locatiemanager mag dan weer alleen
-- gastgegevens, personen en de in-/uitchecktijden wijzigen, en de bijgeboekte
-- extra's en de bedragen gaan weer automatisch terug naar hun oude waarde.
--
-- Verwijdert niets. Bestaande reserveringen blijven zoals ze zijn; alleen
-- toekomstige wijzigingen door een locatiemanager worden weer tegengehouden.

begin;

create or replace function public.bwf_reservering_beperkt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
begin
  v_rol := public.bwf_toegangsrol();
  if v_rol is distinct from 'locatiemanager' then
    return new;
  end if;

  new.suite                   := old.suite;
  new.kanaal                  := old.kanaal;
  new.kanaal_ref              := old.kanaal_ref;
  new.bron_uid                := old.bron_uid;
  new.bron_feed               := old.bron_feed;
  new.feed_gezien_op          := old.feed_gezien_op;
  new.status                  := old.status;
  new.type                    := old.type;
  new.tijdsblok_id            := old.tijdsblok_id;
  new.aankomst                := old.aankomst;
  new.vertrek                 := old.vertrek;
  new.arrangementen           := old.arrangementen;
  new.extras                  := old.extras;
  new.omschrijving            := old.omschrijving;
  new.notitie                 := old.notitie;
  new.bedrag_totaal           := old.bedrag_totaal;
  new.betaald_bedrag          := old.betaald_bedrag;
  new.restant_bedrag          := old.restant_bedrag;
  new.betaalstatus            := old.betaalstatus;
  new.betaald_via             := old.betaald_via;
  new.uitbetaling_verwacht    := old.uitbetaling_verwacht;
  new.klant_id                := old.klant_id;
  new.checkin_id              := old.checkin_id;
  new.welkomstcall_id         := old.welkomstcall_id;
  new.nachtregister_id        := old.nachtregister_id;
  new.medewerker              := old.medewerker;
  new.borg_bedrag             := old.borg_bedrag;
  new.borg_wijze              := old.borg_wijze;
  new.borg_ontvangen          := old.borg_ontvangen;
  new.borg_terug              := old.borg_terug;
  new.borg_ingehouden         := old.borg_ingehouden;
  new.borg_afgehandeld        := old.borg_afgehandeld;
  new.borg_notitie            := old.borg_notitie;
  new.review_taak_id          := old.review_taak_id;
  new.review_verstuurd        := old.review_verstuurd;
  new.gastlink_verstuurd      := old.gastlink_verstuurd;
  new.geannuleerd_op          := old.geannuleerd_op;
  new.geannuleerd_door_import := old.geannuleerd_door_import;
  new.brongegevens            := old.brongegevens;
  new.bron_bestanden          := old.bron_bestanden;
  new.import_opmerking        := old.import_opmerking;
  new.aangemaakt_door         := old.aangemaakt_door;
  return new;
end
$$;

comment on function public.bwf_reservering_beperkt() is
  'Locatiemanager mag alleen gastgegevens, personen en de in-/uitchecktijden wijzigen; de rest blijft ongewijzigd.';

commit;
