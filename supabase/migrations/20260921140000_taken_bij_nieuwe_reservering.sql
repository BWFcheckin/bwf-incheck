-- ============================================================
-- Automatisch een taak bij een nieuwe reservering
-- NOG NIET UITGEVOERD - eerst laten zien aan Angela.
--
-- WAT ANGELA VROEG (21-09-2026)
--   1. Bij een nieuwe reservering een taak voor Kelly: gastgegevens
--      controleren en de boeking verwerken.
--   2. Komt de gast binnen 24 uur aan, dan een spoedmelding voor de
--      locatiemanager van die dag.
--
-- WAAROM EEN TRIGGER EN NIET EEN SCHERM
-- Boekingen komen binnen via de koppeling met Booking.com, Origineel
-- Overnachten en de SMG-planning - vaak 's nachts, zonder dat er iemand een
-- scherm openheeft. Een regel in de database zelf werkt altijd.
--
-- DRIE VEILIGHEIDSKLEPPEN
--   * De hele trigger staat in een exception-block. Gaat er iets mis bij het
--     aanmaken van de taak, dan wordt dat genegeerd en komt de reservering
--     gewoon binnen. Een boeking mag nooit stranden op een taak.
--   * Geen taak bij een aankomst in het verleden. Bij een herstelactie of een
--     nieuwe import van oude gegevens zou je anders honderden taken krijgen.
--   * Geen tweede taak voor dezelfde reservering: er wordt eerst gekeken of
--     er al een taak met dezelfde verwijzing openstaat.
--
-- WIE KRIJGT WAT
--   De controletaak gaat naar Kelly, opgezocht op naam in wz_medewerkers.
--   Is er geen Kelly (of is ze niet actief), dan wordt de taak zonder naam
--   aangemaakt; hij blijft zichtbaar via de locatie en gaat niet verloren.
--
--   De spoedtaak krijgt bewust geen naam. wz_taken.locatie bepaalt sinds
--   16-09-2026 wie een taak ziet: met locatie 'Lelystad' zien Ruth, Jerry en
--   Michel hem vanzelf, en de eigenaar en de VR's sowieso. Dat is precies de
--   groep die hem moet zien, en het werkt ook als het rooster voor die dag
--   nog niet is ingevuld.
--
-- Er wordt niets verwijderd en er verandert geen enkele bestaande rij.
-- ============================================================

begin;

create or replace function public.bwf_taak_bij_nieuwe_reservering()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_kelly      public.wz_taken.medewerker_id%type;
  v_locatie    text;
  v_naam       text;
  v_kenmerk    text;
  v_uren       numeric;
  v_al_gedaan  boolean;
begin
  /* Geannuleerde boekingen en regels zonder datum slaan we over. */
  if new.aankomst is null or coalesce(new.status, '') = 'geannuleerd' then
    return new;
  end if;

  /* Alleen vooruit kijken: een import van oude gegevens levert anders een
     stortvloed aan taken op. */
  if new.aankomst < now() then
    return new;
  end if;

  /* Staat er al een taak voor deze reservering, dan niet nog een keer. */
  select exists (
    select 1 from public.wz_taken t
     where t.link = 'reservering:' || new.id::text
       and coalesce(t.status, 'open') <> 'klaar'
  ) into v_al_gedaan;
  if v_al_gedaan then
    return new;
  end if;

  /* De locatie zoals wz_taken.locatie hem accepteert: alleen Almere of
     Lelystad (zie 20260916190000_taken_per_locatie_en_eigenaar.sql). */
  v_locatie := case
    when new.suite = 'angie' then 'Almere'
    when new.suite in ('malina_jacuzzi', 'malina_deluxe') then 'Lelystad'
    else null
  end;

  v_naam := nullif(trim(coalesce(new.gast_voornaam, '') || ' ' ||
                        coalesce(new.gast_achternaam, '')), '');
  v_kenmerk := coalesce(nullif(new.kanaal_ref, ''), new.id::text);
  v_uren := extract(epoch from (new.aankomst - now())) / 3600;

  /* 1. De controletaak voor Kelly. */
  select id into v_kelly
    from public.wz_medewerkers
   where naam ilike 'kelly%'
     and coalesce(actief, true) is true
   order by naam
   limit 1;

  insert into public.wz_taken
    (titel, omschrijving, medewerker_id, locatie, prioriteit, status, link, aangemaakt)
  values (
    '[Controle] Gastgegevens nakijken — ' || coalesce(v_naam, 'zonder naam'),
    'Nieuwe reservering ' || v_kenmerk ||
      ' · ' || coalesce(v_locatie, coalesce(new.suite, 'onbekende suite')) ||
      ' · aankomst ' || to_char(new.aankomst, 'DD-MM-YYYY HH24:MI') ||
      ' · geboekt via ' || coalesce(new.kanaal, 'onbekend') ||
      case when v_naam is null then E'\nEr staan nog geen gastgegevens bij deze boeking.' else '' end,
    v_kelly,
    v_locatie,
    'normaal',
    'open',
    'reservering:' || new.id::text,
    now()
  );

  /* 2. Spoedtaak als de gast binnen 24 uur aankomt. Zonder naam erop: de
        locatie bepaalt wie hem ziet. */
  if v_uren <= 24 then
    insert into public.wz_taken
      (titel, omschrijving, medewerker_id, locatie, prioriteit, status, link, aangemaakt)
    values (
      '[SPOED] Aankomst binnen 24 uur — ' || coalesce(v_naam, 'zonder naam'),
      'Deze boeking kwam net binnen en de gast komt over ' ||
        to_char(round(v_uren), 'FM999') || ' uur aan (' ||
        to_char(new.aankomst, 'DD-MM-YYYY HH24:MI') || ').' ||
        E'\nControleer of de suite klaar is en of de gastgegevens kloppen.',
      null,
      v_locatie,
      'hoog',
      'open',
      'reservering-spoed:' || new.id::text,
      now()
    );
  end if;

  return new;

exception when others then
  /* Een boeking mag nooit stranden op een taak. */
  raise warning 'taak bij nieuwe reservering overgeslagen: %', sqlerrm;
  return new;
end;
$function$;

drop trigger if exists bwf_taak_bij_nieuwe_reservering on public.reserveringen;
create trigger bwf_taak_bij_nieuwe_reservering
  after insert on public.reserveringen
  for each row
  execute function public.bwf_taak_bij_nieuwe_reservering();

commit;

-- Controle achteraf:
--   select tgname, tgenabled from pg_trigger
--    where tgrelid = 'public.reserveringen'::regclass and not tgisinternal;
-- Verwacht: bwf_taak_bij_nieuwe_reservering met tgenabled = 'O'.

-- ============================================================
-- TERUGDRAAIEN
--   begin;
--   drop trigger if exists bwf_taak_bij_nieuwe_reservering on public.reserveringen;
--   drop function if exists public.bwf_taak_bij_nieuwe_reservering();
--   commit;
-- De taken die al zijn aangemaakt blijven staan; die horen bij het werk dat
-- gedaan moet worden en worden niet weggegooid.
-- ============================================================
