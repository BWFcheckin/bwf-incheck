-- Fase 1 · migratie 1/4 — structuur
-- Voegt alleen toe: extensies, een hulpfunctie, nieuwe tabellen, nieuwe kolommen en een privé-bucket.
-- Wijzigt of verwijdert geen bestaande gegevens. Nieuwe tabellen krijgen meteen RLS zonder
-- policies (= dicht voor de website) tot migratie 4.
begin;

-- Extensies voor de ICS-import (fase 2)
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
create extension if not exists pg_net with schema extensions;

-- Eén schrijfwijze voor suites; zet oude waarden om (deluxe, Malina Zwembad, PSMD, jacuzzi, PSA …)
create or replace function public.bwf_suite(p text)
returns text
language sql immutable
set search_path = ''
as $$
  select case lower(trim(coalesce(p, '')))
    when 'angie'              then 'angie'
    when 'suite angie almere' then 'angie'
    when 'psa'                then 'angie'
    when 'malina_jacuzzi'     then 'malina_jacuzzi'
    when 'malina jacuzzi'     then 'malina_jacuzzi'
    when 'jacuzzi'            then 'malina_jacuzzi'
    when 'psm'                then 'malina_jacuzzi'
    when 'malina_deluxe'      then 'malina_deluxe'
    when 'malina deluxe'      then 'malina_deluxe'
    when 'deluxe'             then 'malina_deluxe'
    when 'malina zwembad'     then 'malina_deluxe'
    when 'zwembad'            then 'malina_deluxe'
    when 'psmd'               then 'malina_deluxe'
  end
$$;

create or replace function public.bwf_zet_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- Rechten per medewerker. Nieuwe kolommen: de bestaande kolom rol blijft zoals vr2.html hem gebruikt.
alter table public.wz_medewerkers
  add column if not exists toegangsrol text
    check (toegangsrol in ('eigenaar', 'vr', 'locatiemanager')),
  add column if not exists suites text[] not null default '{}'
    check (suites <@ array['angie', 'malina_jacuzzi', 'malina_deluxe']);

-- Tijdsblokken per suite, exact zoals in SMG
create table if not exists public.tijdsblokken (
  id            uuid primary key default gen_random_uuid(),
  suite         text not null check (suite in ('angie', 'malina_jacuzzi', 'malina_deluxe')),
  type          text not null check (type in ('dagverblijf', 'avond', 'overnachting', 'late_checkin', 'honeymoon')),
  naam          text not null,
  begin         time not null,
  eind          time not null,
  overnachting  boolean not null,
  volgende_dag  boolean generated always as (eind <= begin) stored,
  smg_room_id   integer not null,
  actief        boolean not null default true,
  sortering     integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (suite, begin, eind)
);

-- Kanaalgegevens per suite. De ICS-link zelf staat nooit in de database: alleen de naam van het Supabase-secret.
create table if not exists public.kanaal_instellingen (
  id              uuid primary key default gen_random_uuid(),
  kanaal          text not null check (kanaal in ('smg', 'oo', 'booking', 'planyo', 'eigen', 'handmatig')),
  suite           text not null check (suite in ('angie', 'malina_jacuzzi', 'malina_deluxe')),
  extern_id       text,
  ics_secret      text,
  uitbetaalregel  text check (uitbetaalregel in ('direct', 'na_aankomst', 'dag7_volgende_maand')),
  actief          boolean not null default true,
  bijgewerkt      timestamptz not null default now(),
  unique (kanaal, suite)
);

-- De ene reserveringstabel
create table if not exists public.reserveringen (
  id                   uuid primary key default gen_random_uuid(),
  suite                text not null check (suite in ('angie', 'malina_jacuzzi', 'malina_deluxe')),
  kanaal               text not null check (kanaal in ('smg', 'oo', 'booking', 'planyo', 'eigen', 'handmatig')),
  kanaal_ref           text,
  bron_uid             text,
  feed_gezien_op       timestamptz,
  status               text not null default 'bevestigd' check (status in ('bevestigd', 'optie', 'geannuleerd', 'no_show')),
  type                 text not null check (type in ('dagverblijf', 'avond', 'overnachting', 'late_checkin', 'honeymoon')),
  tijdsblok_id         uuid references public.tijdsblokken(id) on delete set null,
  aankomst             timestamptz not null,
  vertrek              timestamptz not null,
  incheck_tijd         time,
  uitcheck_tijd        time,
  gast_voornaam        text,
  gast_achternaam      text,
  gast_email           text,
  gast_telefoon        text,
  gast_adres           text,
  personen             integer default 2,
  arrangementen        jsonb not null default '[]',
  extras               jsonb not null default '[]',
  omschrijving         text,
  bedrag_totaal        numeric(10,2),
  betaald_via          text,
  betaalstatus         text not null default 'open' check (betaalstatus in ('open', 'deels', 'betaald')),
  restant_bedrag       numeric(10,2),
  uitbetaling_verwacht date,
  brongegevens         text,
  bron_bestanden       jsonb not null default '[]',
  klant_id             text references public.wz_klantbeheer(id) on delete set null,
  checkin_id           text references public.checkins(id) on delete set null,
  welkomstcall_id      uuid references public.wz_welkomstcalls(id) on delete set null,
  nachtregister_id     uuid references public.wz_gastenregister(id) on delete set null,
  aangemaakt_door      text,
  gewijzigd_door       text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (kanaal, kanaal_ref),
  check (vertrek > aankomst)
);
create index if not exists reserveringen_suite_aankomst on public.reserveringen (suite, aankomst);
create unique index if not exists reserveringen_bron_uid on public.reserveringen (kanaal, suite, bron_uid) where bron_uid is not null;
create or replace trigger reserveringen_updated_at
  before update on public.reserveringen
  for each row execute function public.bwf_zet_updated_at();

-- Beschikbaarheid / gesloten
create table if not exists public.blokkades (
  id               uuid primary key default gen_random_uuid(),
  suite            text not null check (suite in ('angie', 'malina_jacuzzi', 'malina_deluxe')),
  van              timestamptz not null,
  tot              timestamptz not null,
  reden            text,
  bron             text not null default 'handmatig',
  bron_uid         text,
  aangemaakt_door  text,
  created_at       timestamptz not null default now(),
  check (tot > van)
);
create index if not exists blokkades_suite_van on public.blokkades (suite, van);

-- Voorraad: bestaande tabel uitbreiden + logboek van mutaties
alter table public.voorraad add column if not exists locatie text;
create table if not exists public.voorraad_mutaties (
  id             uuid primary key default gen_random_uuid(),
  voorraad_id    text references public.voorraad(id) on delete set null,
  oud_aantal     integer,
  nieuw_aantal   integer,
  reden          text,
  medewerker_id  uuid references public.wz_medewerkers(id) on delete set null,
  auth_id        uuid default auth.uid(),
  created_at     timestamptz not null default now()
);

-- Werkzaamheden koppelen aan een reservering
alter table public.wz_werkzaamheden
  add column if not exists reservering_id uuid references public.reserveringen(id) on delete set null;

-- Nieuwe tabellen dicht tot migratie 4 (rechten)
alter table public.tijdsblokken        enable row level security;
alter table public.kanaal_instellingen enable row level security;
alter table public.reserveringen       enable row level security;
alter table public.blokkades           enable row level security;
alter table public.voorraad_mutaties   enable row level security;

-- Privé-bucket voor pdf's, foto's en mails bij een reservering (max. 20 MB per bestand)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reservering-bijlagen', 'reservering-bijlagen', false, 20971520,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'text/plain',
              'application/vnd.ms-excel',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

commit;
