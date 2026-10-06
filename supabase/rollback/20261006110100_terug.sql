-- ===========================================================================
--  TERUGDRAAIEN van 20261006110100_psm_administratie_dichtzetten.sql
-- ===========================================================================
--  Zet de oude situatie terug: iedereen die kan inloggen leest en wijzigt
--  alle administraties. Alleen gebruiken als er echt iets mis is - dit maakt
--  de administratie van Michel weer voor alle medewerkers leesbaar.
--
--  De kolom medewerker_id blijft staan en blijft gevuld; die hoort bij stap 1
--  en doet op zichzelf geen kwaad. Er wordt niets verwijderd.
-- ===========================================================================

begin;

drop policy if exists "bwf rechten psm administratie" on public.psm_administratie;

create policy "ingelogd lezen en schrijven" on public.psm_administratie
  for all to authenticated
  using (true)
  with check (true);

commit;

-- Controle:
-- select policyname, permissive, cmd
--   from pg_policies
--  where schemaname = 'public' and tablename = 'psm_administratie';
