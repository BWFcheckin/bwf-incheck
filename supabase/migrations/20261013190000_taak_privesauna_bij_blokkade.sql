-- ===========================================================================
--  Taak "Blokkeren in Privésauna" bij een blokkade uit het dashboard
--  Opdracht Angela, 13-10-2026: "niet beschikbare dagen blokkeer ik via het
--  dashboard, en de blokkade moet dan terechtkomen bij Origineel Overnachten,
--  Booking.com en Privésauna."
-- ===========================================================================
--  Voegt alleen toe: één nieuwe functie en één nieuwe trigger op `blokkades`.
--  Er wordt geen bestaande rij, kolom, functie of trigger gewijzigd.
--
--  Een blokkade uit het dashboard gaat via Planyo naar de website, Booking.com
--  en Origineel Overnachten. Privésauna heeft geen koppeling: dat zet de
--  VR-assistent met de hand dicht. Daarom krijgt elke blokkade die een
--  medewerker in het dashboard zet een taak.
--  Niet voor: blokkades die de import zelf aanmaakt (aangemaakt_door
--  'kanalen-sync': de feeds van Booking.com en Privésauna en de sluitingen uit
--  Planyo) en blokkades die al voorbij zijn.
--  Een fout bij het maken van de taak houdt de blokkade nooit tegen.
-- ===========================================================================

begin;

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

  select id into v_vr
    from public.wz_medewerkers
   where naam ilike 'kelly%'
     and coalesce(actief, true) is true
   order by naam
   limit 1;

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

revoke all on function public.bwf_taak_privesauna_bij_blokkade() from public, anon, authenticated;

drop trigger if exists bwf_taak_privesauna_bij_blokkade on public.blokkades;
create trigger bwf_taak_privesauna_bij_blokkade
  after insert on public.blokkades
  for each row execute function public.bwf_taak_privesauna_bij_blokkade();

commit;
