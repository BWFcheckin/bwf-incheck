-- ============================================================
-- Taken weer kunnen aanmaken, wijzigen en verwijderen
-- NOG NIET UITGEVOERD - eerst laten zien aan Angela.
--
-- WAAROM DIT NODIG IS
-- Op wz_taken staan sinds fase 1 vier policies, en die zijn alle vier
-- "as restrictive" (20260911120300_fase1_rechten.sql, regel 97-113).
-- In PostgreSQL kan een restrictive policy alleen maar verder inperken:
-- er moet altijd minstens een permissive policy zijn die iets toestaat.
-- Zonder zo'n permissive policy wordt elke regel geweigerd.
--
-- Die permissive policy was "wz_taken_ingelogd" (for all, using true,
-- with check true). Migratie 20260916190000_taken_per_locatie_en_eigenaar.sql
-- heeft die op regel 57 verwijderd om te voorkomen dat locatiemanagers alle
-- taken konden zien. Daarbij is wel een nieuwe permissive policy voor LEZEN
-- teruggezet (regel 68-74), maar niet voor aanmaken, wijzigen en verwijderen.
--
-- Gevolg: taken lezen werkt, taken opslaan niet. Dat klopt met wat het scherm
-- toont: "Niet bewaard".
--
-- WAT DEZE MIGRATIE DOET
-- Drie permissive policies terug, met precies de voorwaarden die de
-- bestaande restrictive policies ook al eisen. Het gedrag wordt daarmee wat
-- er in fase 1 als bedoeling is opgeschreven:
--   aanmaken     - iedereen met een toegangsrol
--   wijzigen     - eigenaar en vr alles; anderen hun eigen taken
--   verwijderen  - idem
-- De restrictive policies blijven staan en blijven meebepalen, dus er gaat
-- niets ruimer open dan hierboven staat. Lezen blijft ongemoeid: de
-- beperking per locatie van 16-09 blijft precies zoals hij is.
--
-- Er wordt niets verwijderd en er verandert geen enkele waarde in de tabel.
-- ============================================================

begin;

-- Aanmaken. Zelfde voorwaarde als de restrictive policy
-- "bwf rechten taken aanmaken" uit fase 1.
drop policy if exists "bwf taken aanmaken toestaan" on public.wz_taken;
create policy "bwf taken aanmaken toestaan" on public.wz_taken
  for insert to authenticated
  with check ((select public.bwf_toegangsrol()) is not null);

-- Wijzigen: eigenaar en vr alles, anderen hun eigen taken - of de taken die
-- ze zelf hebben uitgezet. Zelfde voorwaarde als "bwf rechten taken wijzigen".
drop policy if exists "bwf taken wijzigen toestaan" on public.wz_taken;
create policy "bwf taken wijzigen toestaan" on public.wz_taken
  for update to authenticated
  using ((select public.bwf_toegangsrol()) in ('eigenaar', 'vr')
         or medewerker_id = (select public.bwf_medewerker_id())
         or aangemaakt_door = (select public.bwf_medewerker_id()))
  with check ((select public.bwf_toegangsrol()) is not null);

-- Verwijderen: zelfde kring als wijzigen.
drop policy if exists "bwf taken verwijderen toestaan" on public.wz_taken;
create policy "bwf taken verwijderen toestaan" on public.wz_taken
  for delete to authenticated
  using ((select public.bwf_toegangsrol()) in ('eigenaar', 'vr')
         or medewerker_id = (select public.bwf_medewerker_id())
         or aangemaakt_door = (select public.bwf_medewerker_id()));

commit;

-- Controle achteraf - verwacht: drie regels met permissive = PERMISSIVE
--   select polname, polpermissive, polcmd
--   from pg_policy where polrelid = 'public.wz_taken'::regclass
--   order by polpermissive desc, polname;

-- ============================================================
-- TERUGDRAAIEN
--   begin;
--   drop policy if exists "bwf taken aanmaken toestaan"    on public.wz_taken;
--   drop policy if exists "bwf taken wijzigen toestaan"    on public.wz_taken;
--   drop policy if exists "bwf taken verwijderen toestaan" on public.wz_taken;
--   commit;
-- Daarmee is de situatie weer precies zoals nu: taken zijn leesbaar maar
-- niet op te slaan.
-- ============================================================
