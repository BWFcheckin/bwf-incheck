-- ===========================================================================
--  TERUGDRAAIEN van 20261006140100_uren_registratie_dichtzetten.sql
-- ===========================================================================
--  Zet de oude situatie terug: iedereen die kan inloggen leest en wijzigt alle
--  urenstaten. Alleen gebruiken als er echt iets mis is - dit maakt de
--  urenstaat van Ruth weer voor alle medewerkers leesbaar en wijzigbaar.
--
--  De kolom medewerker_id blijft staan en blijft gevuld; die hoort bij stap 1
--  en doet op zichzelf geen kwaad. Er wordt niets verwijderd.
-- ===========================================================================

begin;

drop policy if exists "bwf rechten uren registratie" on public.uren_registratie;

create policy "ingelogd lezen en schrijven" on public.uren_registratie
  for all to authenticated
  using (true)
  with check (true);

commit;

-- Controle:
-- select policyname, cmd from pg_policies
--  where schemaname = 'public' and tablename = 'uren_registratie';
