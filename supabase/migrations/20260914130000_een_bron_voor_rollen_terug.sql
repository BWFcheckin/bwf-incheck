-- TERUGDRAAIEN van 20260914130000_een_bron_voor_rollen.sql
--
-- Zet is_beheerder() terug op de oude bron: de tabel bwf_rollen.
-- Dit is de definitie zoals die op 14-09-2026 in de database stond,
-- vóór de migratie. Uitvoeren met:
--
--   supabase db query --linked -f supabase/migrations/20260914130000_een_bron_voor_rollen_terug.sql
--
-- Let op: na het terugdraaien telt weer de rij in bwf_rollen. Angela
-- staat daar als 'beheerder'; wie die rij verandert, verandert dan
-- opnieuw haar rechten.

begin;

create or replace function public.is_beheerder()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from bwf_rollen
    where id = auth.uid() and rol = 'beheerder'
  );
$function$;

commit;
