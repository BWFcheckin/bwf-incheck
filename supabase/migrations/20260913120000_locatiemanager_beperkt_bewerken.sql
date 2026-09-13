-- Locatiemanager mag gastgegevens en tijden aanvullen bij de eigen suites
--
-- Besluit Angela 13-09-2026: Ruth, Jerry en Michel mogen bij hun eigen suites
-- de gastgegevens en de in- en uitchecktijden aanvullen — niet het bedrag, de
-- status, de datums, annuleren of de koppelingen.
--
-- RLS kan niet per kolom. Daarom twee dingen:
--   1. de bewerkregel laat een locatiemanager toe voor de eigen suites;
--   2. een trigger zet bij die rol alle andere velden terug op hun oude waarde.
-- Zo kan het scherm gewoon het hele formulier opsturen: wat niet mag, verandert
-- simpelweg niet. Verwijdert niets.

begin;

-- ---------------------------------------------------------------------------
-- 1. Wat een locatiemanager wél mag wijzigen
-- ---------------------------------------------------------------------------
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
    return new;             -- eigenaar en vr mogen alles
  end if;

  /* Toegestaan blijft staan: gast_voornaam, gast_achternaam, gast_email,
     gast_telefoon, gast_adres, personen, incheck_tijd, uitcheck_tijd.
     Al het andere gaat terug naar de oude waarde. */
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

/* Naam begint met b, zodat deze vóór reserveringen_handmatig draait en die
   trigger daarna gewoon handmatig_gewijzigd_op kan zetten. */
create or replace trigger bwf_reserveringen_beperkt
  before update on public.reserveringen
  for each row execute function public.bwf_reservering_beperkt();

-- ---------------------------------------------------------------------------
-- 2. De bewerkregel verruimen naar de locatiemanager (eigen suites)
-- ---------------------------------------------------------------------------
drop policy if exists "reserveringen bewerken" on public.reserveringen;
create policy "reserveringen bewerken" on public.reserveringen
  for update to authenticated
  using (
    (select public.bwf_toegangsrol()) = any (array['eigenaar', 'vr'])
    or ((select public.bwf_toegangsrol()) = 'locatiemanager' and public.bwf_mag_suite(suite))
  )
  with check (
    (select public.bwf_toegangsrol()) = any (array['eigenaar', 'vr'])
    or ((select public.bwf_toegangsrol()) = 'locatiemanager' and public.bwf_mag_suite(suite))
  );

commit;
