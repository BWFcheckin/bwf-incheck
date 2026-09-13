-- Terugdraaien van 20260913120000_locatiemanager_beperkt_bewerken.sql
-- Zet de bewerkrechten terug naar: alleen eigenaar en vr mogen reserveringen
-- wijzigen. Verwijdert geen gegevens.

begin;

drop trigger if exists bwf_reserveringen_beperkt on public.reserveringen;
drop function if exists public.bwf_reservering_beperkt();

drop policy if exists "reserveringen bewerken" on public.reserveringen;
create policy "reserveringen bewerken" on public.reserveringen
  for update to authenticated
  using ((select public.bwf_toegangsrol()) = any (array['eigenaar', 'vr']))
  with check ((select public.bwf_toegangsrol()) = any (array['eigenaar', 'vr']));

commit;
