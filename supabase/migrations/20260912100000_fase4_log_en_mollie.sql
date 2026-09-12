-- Fase 4 — wijzigingslog op reserveringen, en betalingen aan de reservering hangen
-- Alleen toevoegen. Er wordt niets verwijderd of leeggemaakt.

begin;

-- ----------------------------------------------------------------------------
-- 1. Wijzigingslog: wie heeft wat wanneer aan een reservering veranderd
-- ----------------------------------------------------------------------------
create table if not exists public.reservering_log (
  id             bigint generated always as identity primary key,
  reservering_id uuid not null references public.reserveringen(id) on delete cascade,
  wanneer        timestamptz not null default now(),
  door           text,          -- naam van de medewerker, of 'import'
  door_auth      uuid,          -- auth.uid() van wie de wijziging deed (leeg bij de import)
  veld           text not null,
  oud            text,
  nieuw          text
);

comment on table public.reservering_log is
  'Wijzigingen op reserveringen, per veld. Wordt gevuld door een trigger; niemand schrijft hier rechtstreeks in.';

create index if not exists reservering_log_res_idx
  on public.reservering_log (reservering_id, wanneer desc);

alter table public.reservering_log enable row level security;

-- Lezen mag wie de reservering zelf ook mag zien (zelfde suiteregels als elders).
drop policy if exists "log lezen" on public.reservering_log;
create policy "log lezen" on public.reservering_log
  for select to authenticated
  using (exists (select 1 from public.reserveringen r
                  where r.id = reservering_log.reservering_id
                    and public.bwf_mag_suite(r.suite)));

-- De trigger vult de log. Security definer, zodat het loggen nooit kan mislukken
-- op rechten; er is met opzet geen insert-policy voor gebruikers.
create or replace function public.bwf_reservering_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_velden text[] := array[
    'gast_voornaam','gast_achternaam','gast_email','gast_telefoon','gast_adres','personen',
    'suite','aankomst','vertrek','incheck_tijd','uitcheck_tijd','type','tijdsblok_id','status',
    'bedrag_totaal','betaald_bedrag','restant_bedrag','betaalstatus','betaald_via','uitbetaling_verwacht',
    'arrangementen','extras','omschrijving','notitie','medewerker',
    'klant_id','checkin_id','welkomstcall_id','nachtregister_id',
    'borg_bedrag','borg_wijze','borg_ontvangen','borg_terug','borg_ingehouden','borg_afgehandeld','borg_notitie',
    'review_taak_id','review_verstuurd','gastlink_verstuurd','geannuleerd_op'
  ];
  v_veld  text;
  v_oud   text;
  v_nieuw text;
  v_door  text;
  v_oudj  jsonb := pg_catalog.to_jsonb(old);
  v_nieuwj jsonb := pg_catalog.to_jsonb(new);
begin
  v_door := coalesce(
    nullif(new.gewijzigd_door, ''),
    (select m.naam from public.wz_medewerkers m where m.auth_id = auth.uid()),
    case when auth.uid() is null then 'import' else 'onbekend' end);

  foreach v_veld in array v_velden loop
    v_oud   := v_oudj   ->> v_veld;
    v_nieuw := v_nieuwj ->> v_veld;
    if v_oud is distinct from v_nieuw then
      insert into public.reservering_log (reservering_id, door, door_auth, veld, oud, nieuw)
      values (new.id, v_door, auth.uid(), v_veld, v_oud, v_nieuw);
    end if;
  end loop;
  return new;
end
$$;

create or replace trigger reserveringen_log
  after update on public.reserveringen
  for each row execute function public.bwf_reservering_log();

-- ----------------------------------------------------------------------------
-- 2. Mollie-betalingen aan de reservering en de welkomstcall hangen
--    (de tabel is leeg; de webhook vult deze kolommen voortaan uit de metadata)
-- ----------------------------------------------------------------------------
alter table public.mollie_betalingen
  add column if not exists reservering_id  uuid references public.reserveringen(id) on delete set null,
  add column if not exists welkomstcall_id uuid references public.wz_welkomstcalls(id) on delete set null,
  add column if not exists soort           text;   -- restant / extras / tijd / gemengd

comment on column public.mollie_betalingen.reservering_id is
  'Bij welke boeking hoort deze betaling. Komt uit de metadata die de betaallink meekrijgt.';
comment on column public.mollie_betalingen.soort is
  'Waarvoor de link is gemaakt: restant van de boeking, bijgeboekte extras, tijdstoeslag, of gemengd.';

create index if not exists mollie_betalingen_res_idx  on public.mollie_betalingen (reservering_id);
create index if not exists mollie_betalingen_call_idx on public.mollie_betalingen (welkomstcall_id);

commit;
