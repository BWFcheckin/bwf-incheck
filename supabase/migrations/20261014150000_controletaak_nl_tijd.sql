-- ===========================================================================
--  Controletaak bij een nieuwe reservering: aankomsttijd in Nederlandse tijd
--  Opdracht Angela, 14-10-2026
-- ===========================================================================
--  De taak toonde de aankomst in UTC (2 uur te vroeg in de zomer, 1 uur in de
--  winter). Alleen de twee to_char-regels krijgen "at time zone
--  'Europe/Amsterdam'". Verder is de functie gelijk aan wat live draait.
--  Bestaande taken en reserveringen worden niet aangepast.
-- ===========================================================================

begin;

CREATE OR REPLACE FUNCTION public.bwf_taak_bij_nieuwe_reservering()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      ' · aankomst ' || to_char(new.aankomst at time zone 'Europe/Amsterdam', 'DD-MM-YYYY HH24:MI') ||
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
        to_char(new.aankomst at time zone 'Europe/Amsterdam', 'DD-MM-YYYY HH24:MI') || ').' ||
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

commit;
