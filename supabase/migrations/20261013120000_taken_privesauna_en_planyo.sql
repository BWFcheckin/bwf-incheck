-- ===========================================================================
--  Taken bij een nieuwe reservering: "Blokkeren in Privésauna" en
--  "NIET in Planyo: nalopen"
--  Opdracht Angela, 12-10-2026 (OPDRACHT-PLANYO-EN-BEDRAGEN.md, stap 5B)
-- ===========================================================================
--  Voegt alleen toe: één nieuwe functie en één nieuwe trigger (na invoegen).
--  Er wordt geen bestaande rij, kolom, functie of trigger gewijzigd. De
--  bestaande controletaak (bwf_taak_bij_nieuwe_reservering) blijft zoals hij is.
--
--  1. Blokkeren in Privésauna
--     Planyo sluit de website, Booking.com en Origineel Overnachten vanzelf.
--     Privésauna niet: dat doet de VR-assistent met de hand. Daarom krijgt
--     elke nieuwe reservering die niet via Privésauna binnenkwam een taak.
--     Niet voor: kanaal smg, alles wat uit de Privésauna-feed komt
--     (bron_feed smg: dan staat het daar al), geannuleerde regels en
--     aankomsten in het verleden.
--
--  2. NIET in Planyo
--     Koos de medewerker "toch opslaan" nadat Planyo de reservering weigerde
--     (niet_in_planyo = true), dan komt er een taak met hoge prioriteit om het
--     na te lopen.
--
--  Beide taken gaan naar dezelfde persoon als de bestaande controletaak
--  (de VR-assistent). Een fout bij het maken van een taak houdt de reservering
--  nooit tegen.
-- ===========================================================================

begin;

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

  select id into v_vr
    from public.wz_medewerkers
   where naam ilike 'kelly%'
     and coalesce(actief, true) is true
   order by naam
   limit 1;

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

revoke all on function public.bwf_taak_privesauna_en_planyo() from public, anon, authenticated;

drop trigger if exists bwf_taak_privesauna_en_planyo on public.reserveringen;
create trigger bwf_taak_privesauna_en_planyo
  after insert on public.reserveringen
  for each row execute function public.bwf_taak_privesauna_en_planyo();

commit;
