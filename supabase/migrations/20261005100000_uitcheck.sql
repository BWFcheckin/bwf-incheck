-- ===========================================================================
--  Uitchecken met de gast vastleggen - Angela, 05-10-2026
-- ===========================================================================
--  In DRIE stukken. Draai ze los, in deze volgorde. Een lang plaksel werd op
--  05-10-2026 halverwege afgekapt in de SQL-editor ("syntax error at end of
--  input"); kortere stukken zijn daar niet gevoelig voor.
--
--  WAAROM EEN EIGEN TABEL: op reserveringen staat de trigger
--  bwf_reservering_beperkt, die velden voor een locatiemanager stil terugdraait.
--  Juist de locatiemanager vult dit in, dus in kolommen op reserveringen zou
--  het uitchecken geruisloos verdwijnen.
--
--  WAAROM DE ZWARTE LIJST BIJ DE KLANT: een gast die je niet meer wilt
--  ontvangen, wil je herkennen bij de VOLGENDE boeking.
--
--  Er wordt niets verwijderd, leeggemaakt of overschreven.
-- ===========================================================================


-- ===========================================================================
--  STUK 1 van 3 - de tabel
-- ===========================================================================
begin;

create table if not exists public.uitcheck (
  id                 uuid primary key default gen_random_uuid(),
  reservering_id     uuid not null unique
                     references public.reserveringen(id) on delete cascade,
  stemming           text,
  punten             text[] not null default '{}',
  toelichting        text,
  notitie            text,
  overdracht         boolean not null default false,
  overdracht_punten  text[] not null default '{}',
  overdracht_tekst   text,
  gerookt_bedrag     numeric(10,2),
  schade_bedrag      numeric(10,2),
  door               text,
  door_auth          uuid,
  afgerond_op        timestamptz,
  openstaand_bij_afronden numeric(10,2),
  aangemaakt_op      timestamptz not null default now(),
  bijgewerkt_op      timestamptz not null default now()
);

create index if not exists uitcheck_reservering_idx on public.uitcheck (reservering_id);
create index if not exists uitcheck_afgerond_idx    on public.uitcheck (afgerond_op desc);

create or replace function public.bwf_uitcheck_stempel()
returns trigger language plpgsql as $$
begin
  new.bijgewerkt_op := now();
  return new;
end $$;

drop trigger if exists bwf_uitcheck_stempel on public.uitcheck;
create trigger bwf_uitcheck_stempel
  before update on public.uitcheck
  for each row execute function public.bwf_uitcheck_stempel();

commit;

-- controle stuk 1 (verwacht: t, 0)
-- select to_regclass('public.uitcheck') is not null as tabel_bestaat,
--        (select count(*) from public.uitcheck)     as rijen_nu;


-- ===========================================================================
--  STUK 2 van 3 - de zwarte lijst bij de klant
-- ===========================================================================
begin;

alter table public.wz_klantbeheer
  add column if not exists zwarte_lijst       boolean not null default false,
  add column if not exists zwarte_lijst_reden text,
  add column if not exists zwarte_lijst_op    timestamptz,
  add column if not exists zwarte_lijst_door  text;

commit;

-- controle stuk 2 (verwacht: 4, 0)
-- select count(*) as nieuwe_velden from information_schema.columns
--  where table_schema='public' and table_name='wz_klantbeheer'
--    and column_name like 'zwarte_lijst%';
-- select count(*) as op_de_zwarte_lijst from public.wz_klantbeheer where zwarte_lijst;


-- ===========================================================================
--  STUK 3 van 3 - de rechten
-- ===========================================================================
--  Eerst een hulpfunctie, zodat elke regel hieronder op een regel past. Geen
--  security definer: de subvraag op reserveringen valt dan onder de gewone
--  RLS daar, en dat is precies de afscherming die we willen.
--
--  Permissieve regels zeggen WIE iets mag; de restrictieve regel eist een rol.
--  Zonder permissieve regel kan niemand opslaan - dat is hier eerder misgegaan.
begin;

create or replace function public.bwf_mag_uitcheck(res uuid)
returns boolean language sql stable as $$
  select (select public.bwf_toegangsrol()) in ('eigenaar','vr')
      or exists (select 1 from public.reserveringen r where r.id = res);
$$;

alter table public.uitcheck enable row level security;

drop policy if exists "uitcheck lezen" on public.uitcheck;
create policy "uitcheck lezen" on public.uitcheck
  for select to authenticated
  using (public.bwf_mag_uitcheck(reservering_id));

drop policy if exists "uitcheck toevoegen" on public.uitcheck;
create policy "uitcheck toevoegen" on public.uitcheck
  for insert to authenticated
  with check (public.bwf_mag_uitcheck(reservering_id));

drop policy if exists "uitcheck bijwerken" on public.uitcheck;
create policy "uitcheck bijwerken" on public.uitcheck
  for update to authenticated
  using (public.bwf_mag_uitcheck(reservering_id))
  with check (public.bwf_mag_uitcheck(reservering_id));

drop policy if exists "uitcheck verwijderen" on public.uitcheck;
create policy "uitcheck verwijderen" on public.uitcheck
  for delete to authenticated
  using ((select public.bwf_toegangsrol()) = 'eigenaar');

drop policy if exists "uitcheck rol vereist" on public.uitcheck;
create policy "uitcheck rol vereist" on public.uitcheck
  as restrictive for all to authenticated
  using ((select public.bwf_toegangsrol()) is not null)
  with check ((select public.bwf_toegangsrol()) is not null);

grant select, insert, update, delete on public.uitcheck to authenticated;

commit;

-- controle stuk 3 (verwacht: 5)
-- select count(*) as rechtenregels from pg_policies
--  where schemaname='public' and tablename='uitcheck';
