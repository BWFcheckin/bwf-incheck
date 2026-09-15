-- TERUGDRAAIEN van 20260916140000_sjabloon_gastbericht_alleen_eigenaar.sql
--
-- Zet de rechten op public.instellingen terug zoals ze vóór 16-09-2026 waren:
-- een enkele regel "ingelogd volledig" die iedereen die is ingelogd alles laat
-- lezen, toevoegen, wijzigen en wissen.
--
-- LET OP: na het terugdraaien kan elk ingelogd account de bevestigingstekst
-- aan gasten weer herschrijven, ook accounts die daar niets mee te maken
-- hebben. Dat is precies de situatie van voor de migratie.
--
-- Er gaat geen instelling verloren: er wordt geen rij aangeraakt, alleen de
-- rechtenregels worden vervangen.
--
-- Uitvoeren met:
--   supabase db query --linked -f supabase/rollback/20260916140000_sjabloon_gastbericht_alleen_eigenaar_terugdraaien.sql

begin;

drop policy if exists "instellingen verwijderen" on public.instellingen;
drop policy if exists "instellingen bewerken"    on public.instellingen;
drop policy if exists "instellingen toevoegen"   on public.instellingen;
drop policy if exists "instellingen lezen"       on public.instellingen;

create policy "ingelogd volledig" on public.instellingen
  for all to authenticated
  using (true)
  with check (true);

commit;
