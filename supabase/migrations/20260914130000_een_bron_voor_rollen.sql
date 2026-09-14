-- Eén bron voor rollen: wz_medewerkers (keuze Angela, 14-09-2026)
--
-- Tot nu toe stonden rollen op twee plekken:
--   * wz_medewerkers.toegangsrol  -> eigenaar / vr / locatiemanager   (in gebruik)
--   * bwf_rollen.rol              -> beheerder / medewerker           (oud)
-- Die twee spraken elkaar tegen: Angela staat in de nieuwe tabel als
-- 'eigenaar' en in de oude als 'beheerder'. Daardoor zag zij op de
-- startpagina geen enkele tegel.
--
-- Deze migratie laat is_beheerder() de nieuwe bron lezen. Daarmee hangt
-- er niets meer aan bwf_rollen en kan die tabel uit gebruik.
--
-- VERWIJDERT NIETS. De tabel bwf_rollen, de weergave
-- urenregistratie_welkomstcalls en alle rechtenregels blijven staan.
-- Alleen de inhoud van één functie verandert.
--
-- Wat is_beheerder() bewaakt (nagekeken op 14-09-2026):
--   * bwf_rollen  — "eigen rol zien"        (SELECT)
--   * welkomstcalls — "eigen calls zien"    (SELECT)
--   * welkomstcalls — "eigen calls bijwerken" (UPDATE)
--   * welkomstcalls — "beheerder verwijdert"  (DELETE)
-- De tabel welkomstcalls is leeg (0 rijen) en wordt door geen enkele
-- pagina gebruikt; het echte werk staat in wz_welkomstcalls (62 rijen).
--
-- Terugdraaien: zie 20260914130000_een_bron_voor_rollen_terug.sql

begin;

create or replace function public.is_beheerder()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  /* Vroeger: bwf_rollen waar rol = 'beheerder'.
     Nu: de toegangsrol uit wz_medewerkers, dezelfde bron die
     bwf_toegangsrol() en alle pagina's gebruiken. */
  select exists (
    select 1 from wz_medewerkers
    where auth_id = auth.uid() and toegangsrol = 'eigenaar'
  );
$function$;

commit;
