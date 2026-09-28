-- Cadeaubonnen
-- ---------------------------------------------------------------------------
-- Angela, 28-09-2026: "ik heb van Privésauna allemaal plastic cadeaubonnen die
-- allemaal een unieke code hebben, deze wil ik kunnen verzilveren tijdens het
-- boeken. Daarnaast wil ik ook een aparte codegenerator voor digitale
-- cadeaubonnen."
--
-- Gevraagd hoe het werkt; het antwoord was:
--   * er is een lijst met de codes van de plastic bonnen
--   * op de bon staat een vast bedrag
--   * een bon mag in delen op: restsaldo blijft staan
--
-- WAT ER AL WAS
-- checkins.cadeau_code: een tekstveld waar je een code in kunt typen. Er wordt
-- niets mee gecontroleerd - geen bestaan, geen saldo, geen dubbel gebruik. Dat
-- veld blijft staan en wordt niet aangeraakt; het is een aantekening bij een
-- incheckformulier en verder niets.
--
-- WAT ERBIJ KOMT: TWEE TABELLEN
--
-- bwf_cadeaubonnen   de bonnen zelf, met hun saldo
-- bwf_bon_gebruik    elke verzilvering apart, met bedrag en reservering
--
-- Waarom twee en niet één: het saldo op de bon is het antwoord op "hoeveel kan
-- ik hier nog mee betalen", en dat moet snel te lezen zijn. De historie is het
-- antwoord op "waar is die 100 euro aan opgegaan", en dat moet compleet zijn.
-- Die twee in één tabel proppen (bijvoorbeeld als jsonb-lijst) maakt het
-- tweede antwoord onvindbaar zodra je wilt weten welke bonnen bij een
-- bepaalde reservering zijn gebruikt.
--
-- Het saldo wordt door een trigger bijgewerkt en niet door het scherm. Reden:
-- twee mensen die tegelijk dezelfde bon verzilveren zouden anders allebei van
-- hetzelfde beginsaldo uitgaan, en dan is de bon twee keer gebruikt. De
-- trigger rekent in de database, waar dat niet kan.
--
-- LET OP DE RLS-VALKUIL
-- Een nieuwe tabel erft geen policies. Dit project heeft al eens stilgelegen
-- doordat een migratie de enige permissive policy weghaalde en er alleen
-- restrictive regels overbleven - dan weigert Postgres alles (hersteld in
-- 20260921120000_taken_rechten_herstel). Daarom staan hieronder expliciet
-- zowel permissive als restrictive policies.
--
-- Er wordt niets verwijderd en geen bestaande tabel gewijzigd.

begin;

-- ---------------------------------------------------------------------------
-- 1. De bonnen
-- ---------------------------------------------------------------------------
create table if not exists public.bwf_cadeaubonnen (
  id            uuid primary key default gen_random_uuid(),
  /* De code zoals hij op de bon staat. Bij de plastic bonnen van Privésauna
     is dat hun eigen formaat, bij digitale bonnen het formaat dat het scherm
     genereert. Daarom vrije tekst en geen vast patroon.
     Hoofdletterongevoelig uniek: wie "abc123" intypt bedoelt "ABC123". */
  code          text not null,
  soort         text not null default 'plastic',
  waarde        numeric(10,2) not null check (waarde > 0),
  /* Wat er nog op staat. Wordt door de trigger bijgehouden; het scherm schrijft
     hier nooit rechtstreeks in. */
  saldo         numeric(10,2) not null default 0 check (saldo >= 0),
  status        text not null default 'actief',
  uitgegeven_op date not null default current_date,
  geldig_tot    date,
  /* Voor digitale bonnen: aan wie hij is verstuurd. Bij plastic bonnen leeg. */
  ontvanger_naam  text,
  ontvanger_email text,
  van_wie       text,
  bericht       text,
  notitie       text,
  aangemaakt    timestamptz not null default now(),
  aangemaakt_door uuid,
  constraint bwf_cadeaubonnen_soort_check
    check (soort in ('plastic', 'digitaal')),
  constraint bwf_cadeaubonnen_status_check
    check (status in ('actief', 'op', 'geblokkeerd', 'verlopen')),
  /* Het saldo kan nooit boven de oorspronkelijke waarde uitkomen. */
  constraint bwf_cadeaubonnen_saldo_check
    check (saldo <= waarde)
);

-- Twee bonnen met dezelfde code kan niet, ongeacht hoofdletters.
create unique index if not exists bwf_cadeaubonnen_code_idx
  on public.bwf_cadeaubonnen (upper(btrim(code)));

create index if not exists bwf_cadeaubonnen_status_idx
  on public.bwf_cadeaubonnen (status) where status = 'actief';

comment on table public.bwf_cadeaubonnen is
  'Cadeaubonnen met saldo. saldo wordt door een trigger bijgehouden, nooit door een scherm.';

-- ---------------------------------------------------------------------------
-- 2. Het gebruik
-- ---------------------------------------------------------------------------
create table if not exists public.bwf_bon_gebruik (
  id             uuid primary key default gen_random_uuid(),
  bon_id         uuid not null references public.bwf_cadeaubonnen(id) on delete restrict,
  /* Waar hij aan is opgegaan. Mag leeg zijn: een bon kan ook los worden
     verzilverd, bijvoorbeeld aan de balie zonder reservering. */
  reservering_id uuid references public.reserveringen(id) on delete set null,
  bedrag         numeric(10,2) not null check (bedrag <> 0),
  wanneer        timestamptz not null default now(),
  door           text,
  notitie        text
);

create index if not exists bwf_bon_gebruik_bon_idx on public.bwf_bon_gebruik (bon_id);
create index if not exists bwf_bon_gebruik_res_idx on public.bwf_bon_gebruik (reservering_id)
  where reservering_id is not null;

comment on table public.bwf_bon_gebruik is
  'Elke verzilvering apart. Een negatief bedrag is een terugboeking.';
comment on column public.bwf_bon_gebruik.bedrag is
  'Positief = van de bon af. Negatief = terug op de bon, bij een geannuleerde boeking.';

-- ---------------------------------------------------------------------------
-- 3. Het saldo bijhouden
-- ---------------------------------------------------------------------------
-- In de database en niet in het scherm: twee mensen die tegelijk dezelfde bon
-- verzilveren zouden anders allebei van hetzelfde beginsaldo uitgaan.
create or replace function public.bwf_bon_saldo_bij()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bon uuid;
begin
  v_bon := coalesce(new.bon_id, old.bon_id);

  /* De rij op slot zetten zolang we rekenen. Zonder dit kunnen twee
     gelijktijdige verzilveringen allebei slagen terwijl er maar voor één
     saldo was. */
  perform 1 from public.bwf_cadeaubonnen where id = v_bon for update;

  update public.bwf_cadeaubonnen b
     set saldo = b.waarde - coalesce((
           select sum(g.bedrag) from public.bwf_bon_gebruik g where g.bon_id = v_bon
         ), 0),
         status = case
           when b.status in ('geblokkeerd', 'verlopen') then b.status
           when b.waarde - coalesce((
             select sum(g.bedrag) from public.bwf_bon_gebruik g where g.bon_id = v_bon
           ), 0) <= 0 then 'op'
           else 'actief'
         end
   where b.id = v_bon;

  return null;
end
$$;

drop trigger if exists bwf_bon_saldo_trg on public.bwf_bon_gebruik;
create trigger bwf_bon_saldo_trg
  after insert or update or delete on public.bwf_bon_gebruik
  for each row execute function public.bwf_bon_saldo_bij();

-- Een nieuwe bon begint vol.
create or replace function public.bwf_bon_nieuw()
returns trigger
language plpgsql
as $$
begin
  if new.saldo = 0 and tg_op = 'INSERT' then new.saldo := new.waarde; end if;
  new.code := btrim(new.code);
  return new;
end
$$;

drop trigger if exists bwf_bon_nieuw_trg on public.bwf_cadeaubonnen;
create trigger bwf_bon_nieuw_trg
  before insert on public.bwf_cadeaubonnen
  for each row execute function public.bwf_bon_nieuw();

-- ---------------------------------------------------------------------------
-- 4. Rechten
-- ---------------------------------------------------------------------------
-- Zowel permissive als restrictive, zie de waarschuwing bovenaan.
alter table public.bwf_cadeaubonnen enable row level security;
alter table public.bwf_bon_gebruik  enable row level security;

-- Lezen en verzilveren mag iedereen met een toegangsrol: ook Gildo aan de
-- balie moet een bon kunnen nakijken en gebruiken.
drop policy if exists "bonnen lezen" on public.bwf_cadeaubonnen;
create policy "bonnen lezen" on public.bwf_cadeaubonnen
  for select to authenticated
  using ((select public.bwf_toegangsrol()) is not null);

-- Aanmaken en wijzigen van bonnen blijft bij kantoor: een bon aanmaken is
-- geld maken.
drop policy if exists "bonnen beheren" on public.bwf_cadeaubonnen;
create policy "bonnen beheren" on public.bwf_cadeaubonnen
  for all to authenticated
  using ((select public.bwf_toegangsrol()) in ('eigenaar', 'vr'))
  with check ((select public.bwf_toegangsrol()) in ('eigenaar', 'vr'));

drop policy if exists "bonnen rol vereist" on public.bwf_cadeaubonnen;
create policy "bonnen rol vereist" on public.bwf_cadeaubonnen
  as restrictive for all to authenticated
  using ((select public.bwf_toegangsrol()) is not null)
  with check ((select public.bwf_toegangsrol()) is not null);

-- Verzilveren mag wel op locatie.
drop policy if exists "bongebruik lezen" on public.bwf_bon_gebruik;
create policy "bongebruik lezen" on public.bwf_bon_gebruik
  for select to authenticated
  using ((select public.bwf_toegangsrol()) is not null);

drop policy if exists "bongebruik toevoegen" on public.bwf_bon_gebruik;
create policy "bongebruik toevoegen" on public.bwf_bon_gebruik
  for insert to authenticated
  with check ((select public.bwf_toegangsrol()) is not null);

-- Een verzilvering terugdraaien is een correctie op geld: kantoor.
drop policy if exists "bongebruik corrigeren" on public.bwf_bon_gebruik;
create policy "bongebruik corrigeren" on public.bwf_bon_gebruik
  for update to authenticated
  using ((select public.bwf_toegangsrol()) in ('eigenaar', 'vr'))
  with check ((select public.bwf_toegangsrol()) in ('eigenaar', 'vr'));

drop policy if exists "bongebruik verwijderen" on public.bwf_bon_gebruik;
create policy "bongebruik verwijderen" on public.bwf_bon_gebruik
  for delete to authenticated
  using ((select public.bwf_toegangsrol()) in ('eigenaar', 'vr'));

drop policy if exists "bongebruik rol vereist" on public.bwf_bon_gebruik;
create policy "bongebruik rol vereist" on public.bwf_bon_gebruik
  as restrictive for all to authenticated
  using ((select public.bwf_toegangsrol()) is not null)
  with check ((select public.bwf_toegangsrol()) is not null);

commit;

-- ===========================================================================
--  CONTROLE - draai dit erna
-- ===========================================================================
--  1. De twee tabellen bestaan en zijn leeg.

select 'bwf_cadeaubonnen' as tabel, count(*) from public.bwf_cadeaubonnen
union all
select 'bwf_bon_gebruik', count(*) from public.bwf_bon_gebruik;

--  2. Proef met een bon van 100 euro, twee keer deels verzilverd.
--     Hier hoort uit te komen: saldo 25,00 en status actief.

-- insert into public.bwf_cadeaubonnen (code, waarde, soort, notitie)
--   values ('PROEF-0001', 100, 'plastic', 'proefbon, mag weg');
-- insert into public.bwf_bon_gebruik (bon_id, bedrag, door)
--   select id, 60, 'proef' from public.bwf_cadeaubonnen where code = 'PROEF-0001';
-- insert into public.bwf_bon_gebruik (bon_id, bedrag, door)
--   select id, 15, 'proef' from public.bwf_cadeaubonnen where code = 'PROEF-0001';
-- select code, waarde, saldo, status from public.bwf_cadeaubonnen where code = 'PROEF-0001';

--  3. Proefbon opruimen:
-- delete from public.bwf_bon_gebruik where bon_id in
--   (select id from public.bwf_cadeaubonnen where code = 'PROEF-0001');
-- delete from public.bwf_cadeaubonnen where code = 'PROEF-0001';

-- ===========================================================================
--  TERUGDRAAIEN
-- ===========================================================================
--  Zie rollback/20260928200000_cadeaubonnen_terug.sql
