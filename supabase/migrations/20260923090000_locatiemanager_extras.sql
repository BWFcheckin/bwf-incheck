-- Locatiemanager mag de bijgeboekte extra's bijwerken
-- ---------------------------------------------------------------------------
-- Angela, 22-09-2026: "ik wil dat de locatiemanager bijgeboekte items kan
-- verwijderen als ze een verkeerde hebben aangeklikt." Gevraagd hoeveel ruimte
-- dat moest worden; het antwoord was: volledig bewerken.
--
-- WAT ER NU GEBEURT
-- Sinds 20260913120000 zet de trigger bwf_reservering_beperkt() bij een
-- locatiemanager elk veld terug naar de oude waarde, op gastgegevens, personen
-- en de in-/uitchecktijden na. Ook `arrangementen` hoort daarbij. Klikt Gildo
-- een verkeerde extra aan, dan kan hij die niet meer weghalen: het scherm laat
-- de knop niet eens zien, en zou hij het toch versturen dan draait de database
-- het stil terug.
--
-- WAT ER VERANDERT
--   was: arrangementen, extras en de drie bedragvelden gaan terug naar oud
--   nu:  een locatiemanager mag die bij de eigen suites wél wijzigen
--
-- Wat NIET verandert, en met opzet op slot blijft:
--   * status en annuleren        - een boeking weghalen is geen locatiewerk
--   * aankomst, vertrek, suite   - verhuizen of verzetten gaat via kantoor
--   * de koppelingen             - klant, incheckformulier, welkomstcall
--   * borg en uitbetaling        - dat is administratie
--
-- Het blijft beperkt tot de eigen suites: de bewerkregel eromheen vraagt
-- bwf_mag_suite(suite), en die staat ongemoeid.
--
-- Niets wordt verwijderd; er wordt één functie vervangen door dezelfde functie
-- met vier regels minder.

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
    return new;             -- eigenaar en vr mogen alles
  end if;

  /* Toegestaan blijft staan: gast_voornaam, gast_achternaam, gast_email,
     gast_telefoon, gast_adres, personen, incheck_tijd, uitcheck_tijd.
     Sinds 23-09-2026 ook: arrangementen, extras en de drie bedragvelden, zodat
     een verkeerd aangeklikte extra ter plekke rechtgezet kan worden en het
     totaal meteen klopt.
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
  -- arrangementen  : vrijgegeven, zie hierboven
  -- extras         : vrijgegeven, zie hierboven
  new.omschrijving            := old.omschrijving;
  new.notitie                 := old.notitie;
  -- bedrag_totaal  : vrijgegeven, hoort bij de extra's
  -- betaald_bedrag : vrijgegeven, hoort bij de extra's
  -- restant_bedrag : vrijgegeven, hoort bij de extra's
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
  'Locatiemanager mag gastgegevens, personen, de in-/uitchecktijden en de '
  'bijgeboekte extra''s met bijbehorende bedragen wijzigen; de rest blijft '
  'ongewijzigd.';

commit;

-- Terugdraaien: zie rollback/20260923090000_locatiemanager_extras_terug.sql
