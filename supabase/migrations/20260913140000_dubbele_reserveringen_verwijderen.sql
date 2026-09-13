-- Dubbele reserveringen kunnen verwijderen (wens Angela 13-09-2026)
--
-- Tot nu toe kon niemand een reservering verwijderen: er was geen regel voor.
-- Eigenaar en VR mogen het nu wel. Wat verdwijnt wordt eerst vastgelegd in
-- reservering_log, zodat altijd terug te zien is wie wat weghaalde en met
-- welke gegevens.
--
-- Let op: staat de boeking nog in de feed van een kanaal (SMG, Booking.com,
-- Origineel Overnachten), dan zet de import hem bij de volgende ronde opnieuw
-- aan. Voor die gevallen is annuleren de juiste weg; verwijderen is bedoeld
-- voor dubbelen, zoals de Planyo-rijen uit de oude tabel.

begin;

-- ---------------------------------------------------------------------------
-- 1. Vastleggen wat er verdwijnt
-- ---------------------------------------------------------------------------
create or replace function public.bwf_reservering_verwijderlog()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_door text;
begin
  v_door := coalesce(
    (select m.naam from public.wz_medewerkers m where m.auth_id = auth.uid()),
    case when auth.uid() is null then 'systeem' else 'onbekend' end);

  insert into public.reservering_log (reservering_id, door, door_auth, veld, oud, nieuw)
  values (old.id, v_door, auth.uid(), 'verwijderd',
    coalesce(old.kanaal, '?') || ' ' || coalesce(old.kanaal_ref, '?') || ' · ' ||
    coalesce(old.suite, '?') || ' · ' ||
    to_char(old.aankomst at time zone 'Europe/Amsterdam', 'DD-MM-YYYY HH24:MI') || ' · ' ||
    trim(coalesce(old.gast_voornaam, '') || ' ' || coalesce(old.gast_achternaam, '')),
    null);
  return old;
end
$$;

/* De log verwijst met een foreign key naar de reservering en zou met
   on delete cascade meteen weer weg zijn. Daarom loggen we naar een rij die
   blijft bestaan: de verwijzing wordt losgekoppeld. */
alter table public.reservering_log
  drop constraint if exists reservering_log_reservering_id_fkey;
alter table public.reservering_log
  add constraint reservering_log_reservering_id_fkey
  foreign key (reservering_id) references public.reserveringen(id) on delete set null;
alter table public.reservering_log alter column reservering_id drop not null;

create or replace trigger bwf_reserveringen_verwijderlog
  before delete on public.reserveringen
  for each row execute function public.bwf_reservering_verwijderlog();

-- ---------------------------------------------------------------------------
-- 2. Wie mag verwijderen: eigenaar en VR
-- ---------------------------------------------------------------------------
drop policy if exists "reserveringen verwijderen" on public.reserveringen;
create policy "reserveringen verwijderen" on public.reserveringen
  for delete to authenticated
  using ((select public.bwf_toegangsrol()) = any (array['eigenaar', 'vr']));

commit;
