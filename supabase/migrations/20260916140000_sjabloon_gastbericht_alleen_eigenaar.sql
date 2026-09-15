-- VOORSTEL: het gastbericht-sjabloon alleen door de eigenaar laten wijzigen
-- Geschreven 16-09-2026. NOG NIET UITGEVOERD: eerst lezen, dan proefdraaien.
--
-- Angela wil de bevestigingstekst aan gasten kunnen aanpassen, maar niet dat
-- elk ingelogd account die tekst kan herschrijven.
--
-- HOE HET NU STAAT (gecontroleerd op de gekoppelde omgeving):
--   tabel public.instellingen, een sleutel-waardelijst met 18 rijen.
--   Een enkele rechtenregel:
--     "ingelogd volledig" | ALL | {authenticated} | using true | with check true
--   Dus iedereen die is ingelogd mag alles lezen, toevoegen, wijzigen en wissen.
--
-- WAAROM DE REGEL VERVANGEN MOET WORDEN:
--   Rechtenregels worden bij elkaar opgeteld. Een extra, strengere regel
--   toevoegen verandert dus niets: de bestaande regel blijft alles toestaan.
--   De enige manier om een uitzondering te maken is de regel vervangen.
--
-- WAT ER GELIJK BLIJFT:
--   Voor alle 18 bestaande sleutels verandert er niets. Lezen blijft voor
--   iedereen; toevoegen, wijzigen en wissen blijven voor iedereen die is
--   ingelogd. Dat is bewust, want dashboard.html schrijft op twee plekken naar
--   deze tabel (foto's, tijdsblokken) en incheckformulier.html op vier
--   (sjablonen, pdf, toegang). Beide doen dat met een upsert, en die heeft
--   zowel toevoeg- als wijzigrechten nodig; daarom staan die apart hieronder.
--
-- WAT ER VERANDERT:
--   Alleen voor de nieuwe sleutel 'sjabloon_gastbericht' geldt dat toevoegen,
--   wijzigen en wissen voorbehouden is aan de eigenaar. Lezen mag iedereen,
--   anders kan het scherm de tekst niet tonen.
--
-- WAT ER NIET GEBEURT:
--   Er wordt geen rij toegevoegd, gewijzigd of verwijderd. De sleutel
--   'sjabloon_gastbericht' bestaat nog niet en wordt hier ook niet aangemaakt;
--   dat gebeurt pas als de pagina hem voor het eerst opslaat.
--
-- Terugdraaien:
--   supabase/rollback/20260916140000_sjabloon_gastbericht_alleen_eigenaar_terugdraaien.sql
--
-- Uitvoeren met:
--   supabase db query --linked -f supabase/migrations/20260916140000_sjabloon_gastbericht_alleen_eigenaar.sql

begin;

drop policy if exists "ingelogd volledig" on public.instellingen;

create policy "instellingen lezen" on public.instellingen
  for select to authenticated
  using (true);

create policy "instellingen toevoegen" on public.instellingen
  for insert to authenticated
  with check (sleutel <> 'sjabloon_gastbericht'
              or (select public.bwf_toegangsrol()) = 'eigenaar');

create policy "instellingen bewerken" on public.instellingen
  for update to authenticated
  using (sleutel <> 'sjabloon_gastbericht'
         or (select public.bwf_toegangsrol()) = 'eigenaar')
  with check (sleutel <> 'sjabloon_gastbericht'
              or (select public.bwf_toegangsrol()) = 'eigenaar');

create policy "instellingen verwijderen" on public.instellingen
  for delete to authenticated
  using (sleutel <> 'sjabloon_gastbericht'
         or (select public.bwf_toegangsrol()) = 'eigenaar');

commit;
