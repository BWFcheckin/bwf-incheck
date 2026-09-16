-- Taken afschermen: eigen taken plus taken van de eigen locatie
--
-- Aanleiding: Ruth en Jerry (toegangsrol 'locatiemanager') zien nu alle taken.
-- Oorzaak in de database: op wz_taken staat een policy 'wz_taken_ingelogd' met
-- voorwaarde true voor ALLE bewerkingen. RLS-policies werken optellend (OR),
-- dus die ene regel overstemt alle fijnere policies eronder. Iedereen die
-- inlogt kan daardoor elke taak lezen en wijzigen.
--
-- Door Angela bevestigd op 16-09-2026:
--   * De beperking geldt voor de locatiemanagers (Ruth, Jerry, Michel).
--     Kelly en Senna houden als 'vr' hun bredere toegang, Angela als 'eigenaar'.
--   * Michel houdt Almere erbij. Daarom wordt er NIET hardgecodeerd op
--     Lelystad, maar gekeken naar de suites die per persoon al ingesteld staan.
--     Ruth en Jerry hebben daar alleen de twee Lelystad-suites staan, Michel
--     alle drie - dus dit klopt vanzelf voor alle drie.
--   * Zij zien hun eigen taken plus de taken van hun locatie.
--
-- Niets wordt verwijderd behalve twee policies, en die worden in hetzelfde
-- script vervangen. Het terugdraaiscript zet ze exact terug.

begin;

-- 1. Taken krijgen een locatie. Bewust geen vrije tekst: de bestaande tabellen
--    gebruiken drie verschillende schrijfwijzen door elkaar ('Malina Zwembad',
--    'Lelystad Malina', leeg), en daar wil ik geen vierde variant aan toevoegen.
--    Leeg blijven mag: zo'n taak is dan alleen zichtbaar voor degene op wiens
--    naam hij staat, en voor de eigenaar en vr. De 56 bestaande taken worden
--    dus niet stilzwijgend voor iedereen zichtbaar.
alter table public.wz_taken add column if not exists locatie text;

alter table public.wz_taken drop constraint if exists wz_taken_locatie_check;
alter table public.wz_taken add constraint wz_taken_locatie_check
  check (locatie is null or locatie in ('Almere', 'Lelystad'));

-- 2. Hulpfunctie: mag de ingelogde persoon deze locatie zien?
--    Leest de suites die al per medewerker zijn ingesteld, zodat er maar een
--    plek is waar dit wordt bijgehouden. Dezelfde opzet als bwf_mag_suite().
create or replace function public.bwf_mag_locatie(p_locatie text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1 from public.wz_medewerkers m
     where m.auth_id = auth.uid()
       and ( m.toegangsrol in ('eigenaar', 'vr')
          or ( m.toegangsrol = 'locatiemanager'
               and ( (p_locatie = 'Almere'   and 'angie' = any(m.suites))
                  or (p_locatie = 'Lelystad' and ( 'malina_jacuzzi' = any(m.suites)
                                                or 'malina_deluxe'  = any(m.suites) )) ) ) )
  )
$function$;

-- 3. De te ruime policy weg. Dit is de regel die alles openzet.
drop policy if exists "wz_taken_ingelogd" on public.wz_taken;

-- 4. Lezen opnieuw vastleggen. De oude versie liet iedereen met een rol alles
--    lezen; de nieuwe beperkt het tot eigen taken en de eigen locatie.
drop policy if exists "bwf rechten taken lezen" on public.wz_taken;

-- bwf_medewerker_id() bestaat al en wordt door de policies voor wijzigen en
-- verwijderen ook gebruikt. Bewust diezelfde functie, en niet een eigen
-- subquery: anders zijn er twee plekken die moeten bepalen wie "ik" ben, en
-- kunnen die uit elkaar gaan lopen. Hij is STABLE en SECURITY DEFINER, dus
-- veilig binnen een policy.
create policy "bwf rechten taken lezen" on public.wz_taken
  for select to authenticated
  using (
       (select public.bwf_toegangsrol()) in ('eigenaar', 'vr')
    or medewerker_id = (select public.bwf_medewerker_id())
    or (locatie is not null and public.bwf_mag_locatie(locatie))
  );

-- De policies voor aanmaken, wijzigen en verwijderen blijven ongewijzigd: die
-- stonden al goed (wijzigen en verwijderen alleen door eigenaar, vr of degene
-- op wiens naam de taak staat).

commit;
