-- ===========================================================================
--  Twee besluiten van Angela, 13-10-2026
-- ===========================================================================
--  1. De import mag een websiteboeking uit Planyo zelf annuleren als hij in
--     Planyo geannuleerd is, er NIETS op betaald is en niemand hem met de hand
--     heeft gewijzigd. Tot nu toe hield het slot van 05-10-2026
--     (bwf_import_mag_niet_annuleren) elke annulering door de import tegen
--     zodra er een gast of bedrag op stond; een geannuleerde websiteboeking
--     bleef daardoor actief tot iemand hem met de hand annuleerde.
--     Ongewijzigd: voor Privésauna, Booking.com en Origineel Overnachten
--     blijft het slot precies zoals het was, en een boeking waar iets op
--     betaald is of die met de hand is gewijzigd wordt nooit door de import
--     geannuleerd, ook niet uit Planyo.
--     (kanalen_verwerk_planyo probeert alleen te annuleren bij een regel die de
--     import zelf uit Planyo heeft aangemaakt en die in Planyo geannuleerd is;
--     verdwijnen uit de lijst is geen annulering.)
--
--  2. De taken "[Privésauna] Blokkeren" en "[Planyo] NIET in Planyo" staan
--     niet meer op naam van één medewerker: ze zijn voor elke VR-assistent.
--     Bestaande taken blijven zoals ze zijn.
-- ===========================================================================

begin;

create or replace function public.bwf_import_mag_niet_annuleren()
returns trigger
language plpgsql
as $function$
begin
  if new.status = 'geannuleerd'
     and old.status is distinct from 'geannuleerd'
     and new.geannuleerd_door_import is true
     and (btrim(coalesce(old.gast_voornaam, '')) <> ''
       or btrim(coalesce(old.gast_achternaam, '')) <> ''
       or coalesce(old.betaald_bedrag, 0) <> 0
       or coalesce(old.bedrag_totaal, 0) <> 0)
     -- uitzondering: onbetaalde websiteboeking uit Planyo die niemand heeft aangeraakt
     and not (old.bron_feed = 'planyo'
              and old.aangemaakt_door = 'kanalen-sync'
              and coalesce(old.betaald_bedrag, 0) = 0
              and old.handmatig_gewijzigd_op is null)
  then
    new.status                  := old.status;
    new.geannuleerd_door_import := old.geannuleerd_door_import;
    new.import_weg_sinds        := coalesce(old.import_weg_sinds, now());
  end if;

  if new.feed_gezien_op is distinct from old.feed_gezien_op
     and new.feed_gezien_op is not null
     and new.status <> 'geannuleerd'
  then
    new.import_weg_sinds := null;
  end if;

  return new;
end
$function$;

create or replace function public.bwf_taak_privesauna_en_planyo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_vr       public.wz_taken.medewerker_id%type;
  v_locatie  text;
  v_suite    text;
  v_naam     text;
  v_kenmerk  text;
  v_wanneer  text;
begin
  if new.aankomst is null or coalesce(new.status, '') = 'geannuleerd' or new.aankomst < now() then
    return new;
  end if;

  v_locatie := case
    when new.suite = 'angie' then 'Almere'
    when new.suite in ('malina_jacuzzi', 'malina_deluxe') then 'Lelystad'
    else null
  end;
  v_suite := case new.suite
    when 'angie' then 'Angie'
    when 'malina_jacuzzi' then 'Malina Jacuzzi'
    when 'malina_deluxe' then 'Malina Zwembad'
    else coalesce(new.suite, 'onbekende suite')
  end;
  v_naam := nullif(trim(coalesce(new.gast_voornaam, '') || ' ' || coalesce(new.gast_achternaam, '')), '');
  v_kenmerk := coalesce(nullif(new.kanaal_ref, ''), new.id::text);
  v_wanneer := to_char(new.aankomst at time zone 'Europe/Amsterdam', 'DD-MM-YYYY HH24:MI') || ' tot ' ||
               to_char(new.vertrek  at time zone 'Europe/Amsterdam', 'DD-MM-YYYY HH24:MI');

  /* Niet op naam (Angela, 13-10-2026): de taak is voor elke VR-assistent. Zonder naam staat
     hij bij iedereen in de takenlijst. */
  v_vr := null;

  /* 1. Blokkeren in Privésauna. */
  if coalesce(new.kanaal, '') <> 'smg' and coalesce(new.bron_feed, '') <> 'smg'
     and not exists (select 1 from public.wz_taken t where t.link = 'privesauna:' || new.id::text) then
    insert into public.wz_taken
      (titel, omschrijving, medewerker_id, locatie, prioriteit, status, link, aangemaakt)
    values (
      '[Privésauna] Blokkeren — ' || v_suite || ' ' ||
        to_char(new.aankomst at time zone 'Europe/Amsterdam', 'DD-MM-YYYY'),
      'Zet deze tijd dicht in de planning van Privésauna: ' || v_suite || ', ' || v_wanneer || '.' ||
        E'\nReservering ' || v_kenmerk || ' · ' || coalesce(v_naam, 'zonder naam') ||
        ' · geboekt via ' || coalesce(new.kanaal, 'onbekend') || '.',
      v_vr, v_locatie, 'hoog', 'open', 'privesauna:' || new.id::text, now()
    );
  end if;

  /* 2. Toch opgeslagen terwijl Planyo weigerde. */
  if new.niet_in_planyo is true
     and not exists (select 1 from public.wz_taken t where t.link = 'niet-in-planyo:' || new.id::text) then
    insert into public.wz_taken
      (titel, omschrijving, medewerker_id, locatie, prioriteit, status, link, aangemaakt)
    values (
      '[Planyo] NIET in Planyo: nalopen — ' || coalesce(v_naam, 'zonder naam'),
      'Deze reservering staat in het dashboard maar NIET in Planyo. De website, Booking.com en ' ||
        'Origineel Overnachten zijn dus niet geblokkeerd: ' || v_suite || ', ' || v_wanneer || '.' ||
        E'\nReservering ' || v_kenmerk || '. Zet hem alsnog in Planyo en haal daarna het label weg.',
      v_vr, v_locatie, 'hoog', 'open', 'niet-in-planyo:' || new.id::text, now()
    );
  end if;

  return new;

exception when others then
  /* Een boeking mag nooit stranden op een taak. */
  raise warning 'taak privesauna/planyo overgeslagen: %', sqlerrm;
  return new;
end;
$function$;

create or replace function public.bwf_taak_privesauna_bij_blokkade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_vr       public.wz_taken.medewerker_id%type;
  v_locatie  text;
  v_suite    text;
begin
  if new.actief is not true or new.tot < now()
     or coalesce(new.aangemaakt_door, '') = 'kanalen-sync'
     or coalesce(new.bron, '') not in ('handmatig', 'ics-planyo') then
    return new;
  end if;

  v_locatie := case
    when new.suite = 'angie' then 'Almere'
    when new.suite in ('malina_jacuzzi', 'malina_deluxe') then 'Lelystad'
    else null
  end;
  v_suite := case new.suite
    when 'angie' then 'Angie'
    when 'malina_jacuzzi' then 'Malina Jacuzzi'
    when 'malina_deluxe' then 'Malina Zwembad'
    else coalesce(new.suite, 'onbekende suite')
  end;

  /* Niet op naam (Angela, 13-10-2026): de taak is voor elke VR-assistent. Zonder naam staat
     hij bij iedereen in de takenlijst. */
  v_vr := null;

  if not exists (select 1 from public.wz_taken t where t.link = 'privesauna-blokkade:' || new.id::text) then
    insert into public.wz_taken
      (titel, omschrijving, medewerker_id, locatie, prioriteit, status, link, aangemaakt)
    values (
      '[Privésauna] Blokkeren — ' || v_suite || ' ' ||
        to_char(new.van at time zone 'Europe/Amsterdam', 'DD-MM-YYYY'),
      'Zet deze periode dicht in de planning van Privésauna: ' || v_suite || ', ' ||
        to_char(new.van at time zone 'Europe/Amsterdam', 'DD-MM-YYYY HH24:MI') || ' tot ' ||
        to_char(new.tot at time zone 'Europe/Amsterdam', 'DD-MM-YYYY HH24:MI') || '.' ||
        E'\nReden: ' || coalesce(nullif(new.reden, ''), 'gesloten') ||
        ' · gezet door ' || coalesce(nullif(new.aangemaakt_door, ''), 'onbekend') || '.' ||
        case when new.bron = 'handmatig'
             then E'\nLET OP: deze blokkade staat alleen in het dashboard, niet in Planyo. Website, Booking.com en Origineel Overnachten zijn dus ook nog open.'
             else E'\nIn Planyo staat hij al: de website en Booking.com zijn dicht.' end,
      v_vr, v_locatie, 'hoog', 'open', 'privesauna-blokkade:' || new.id::text, now()
    );
  end if;
  return new;

exception when others then
  raise warning 'taak privesauna bij blokkade overgeslagen: %', sqlerrm;
  return new;
end;
$function$;

commit;
