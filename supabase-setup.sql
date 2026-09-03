-- ============================================================
--  Administratie Michel  |  Bed & Wellness Flevoland
--  Supabase > SQL Editor > New query > alles hieronder plakken > Run
--  Eenmalig uitvoeren per Supabase-project.
-- ============================================================

-- 1. De tabel waarin alles wordt opgeslagen ------------------
--    Boekingen BWF, facturen/uitbetalingen, maandstatus en de
--    taxidiensten van MBThere B.V. staan alle vier in deze tabel.
--    De kolom "soort" houdt ze uit elkaar:
--      boeking  = een boeking van een suite
--      betaling = een factuur of uitbetaling aan Michel
--      maand    = het vinkje "maand betaald"
--      dienst   = een taxidienst uit de Cabman-dienstenrapportage

create table if not exists public.psm_administratie (
  id uuid primary key default gen_random_uuid(),
  medewerker text not null,
  soort text not null default 'boeking',

  -- algemeen
  datum date not null,
  opmerking text,
  created_at timestamptz default now(),

  -- boekingen BWF
  locatie text,                 -- PSA, PSM of PSMD
  boeking_nr text,              -- boekingsnummer, of dienstnummer bij een dienst
  tijd_van text,
  tijd_tot text,
  arrangement text,
  bedrag numeric,
  bank_op_locatie numeric,
  cash_op_locatie numeric,
  vergoeding numeric,

  -- facturen, uitbetalingen en maandstatus
  factuur_nr text,
  btw numeric,
  wijze text,
  voldaan boolean default false,

  -- taxidiensten MBThere B.V.
  chauffeur text,
  kenteken text,
  eind_datum date,
  ritten integer,
  contant numeric,
  op_rekening numeric,
  pin numeric,
  minuten integer,
  km_start numeric,
  km_eind numeric,
  dash_start numeric,
  dash_eind numeric,
  km numeric,
  km_beladen numeric,
  km_onbeladen numeric
);

-- 2. Sneller zoeken per persoon en per maand -----------------
create index if not exists psm_administratie_medewerker_datum_idx
  on public.psm_administratie (medewerker, soort, datum);

-- 3. Beveiliging: alleen ingelogde gebruikers ----------------
alter table public.psm_administratie enable row level security;

drop policy if exists "ingelogd lezen en schrijven" on public.psm_administratie;

create policy "ingelogd lezen en schrijven" on public.psm_administratie
  for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
--  Draaide je een eerdere versie van deze pagina en bestaat de
--  tabel al? Voer dan alleen dit stuk uit om de nieuwe kolommen
--  voor de taxidiensten toe te voegen.
-- ============================================================

alter table public.psm_administratie
  add column if not exists chauffeur text,
  add column if not exists kenteken text,
  add column if not exists eind_datum date,
  add column if not exists ritten integer,
  add column if not exists contant numeric,
  add column if not exists op_rekening numeric,
  add column if not exists pin numeric,
  add column if not exists minuten integer,
  add column if not exists km_start numeric,
  add column if not exists km_eind numeric,
  add column if not exists dash_start numeric,
  add column if not exists dash_eind numeric,
  add column if not exists km numeric,
  add column if not exists km_beladen numeric,
  add column if not exists km_onbeladen numeric;

-- ============================================================
--  Controle achteraf
-- ============================================================

-- Hoeveel regels staan er per soort?
-- select soort, count(*) from public.psm_administratie group by soort order by soort;

-- Alles van Michel in augustus 2026:
-- select soort, datum, boeking_nr, bedrag, vergoeding, km
-- from public.psm_administratie
-- where medewerker = 'Michel'
--   and datum between '2026-08-01' and '2026-08-31'
-- order by datum;
