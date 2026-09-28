-- Tegoedbonnen, en cadeaubonnen die op betaling wachten
-- ---------------------------------------------------------------------------
-- Angela, 29-09-2026, twee dingen in één:
--
--   "Ik wil op de cadeaubonpagina ook een Mollie-link kunnen sturen; zodra de
--    link is betaald is de cadeaubon actief."
--   "Ik wil naast de cadeaubon ook een tegoedbon, als klant te veel heeft
--    betaald of als tegemoetkoming bij een klacht."
--
-- HET VERSCHIL TUSSEN DE TWEE, en waarom dat uitmaakt:
--
--   Een CADEAUBON wordt gekocht. Er staat geld tegenover dat binnen moet
--   komen, dus die mag pas gelden als er betaald is.
--
--   Een TEGOEDBON wordt gegeven. Hij is een schuld van ons aan de gast - te
--   veel betaald, of iets goedmaken - en is dus meteen geldig. Er komt geen
--   betaling aan te pas.
--
-- Dat verschil zit in het soort, zodat je later kunt zien wat er is uitgegeven
-- en wat er is verkocht. Voor de boekhouding zijn dat twee heel verschillende
-- dingen: een verkochte bon is omzet die nog geleverd moet worden, een
-- tegoedbon is een kostenpost.
--
-- WAT ERBIJ KOMT
--   soort krijgt de waarde 'tegoed'
--   status krijgt de waarde 'wacht_op_betaling'
--   reden          text   waarom de tegoedbon is gegeven
--   reservering_id uuid   bij welke boeking het misging
--   betaal_id      text   het Mollie-betalingsnummer
--   betaal_link    text   de link die naar de koper is gestuurd
--   betaald_op     timestamptz
--
-- Er wordt niets verwijderd. Bestaande bonnen houden hun soort en status.

begin;

alter table public.bwf_cadeaubonnen
  add column if not exists reden          text,
  add column if not exists reservering_id uuid,
  add column if not exists betaal_id      text,
  add column if not exists betaal_link    text,
  add column if not exists betaald_op     timestamptz;

-- De verwijzing naar de boeking waar het misging. on delete set null: wordt
-- die boeking ooit verwijderd, dan blijft de tegoedbon gewoon geldig - de gast
-- heeft er recht op, los van wat er met de boeking gebeurt.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bwf_cadeaubonnen_reservering_fkey') then
    alter table public.bwf_cadeaubonnen
      add constraint bwf_cadeaubonnen_reservering_fkey
      foreign key (reservering_id) references public.reserveringen(id) on delete set null;
  end if;
end $$;

-- De twee lijsten met toegestane waarden uitbreiden. De oude regel moet eerst
-- weg; een check-constraint is niet te wijzigen.
alter table public.bwf_cadeaubonnen drop constraint if exists bwf_cadeaubonnen_soort_check;
alter table public.bwf_cadeaubonnen
  add constraint bwf_cadeaubonnen_soort_check
  check (soort in ('plastic', 'digitaal', 'tegoed'));

alter table public.bwf_cadeaubonnen drop constraint if exists bwf_cadeaubonnen_status_check;
alter table public.bwf_cadeaubonnen
  add constraint bwf_cadeaubonnen_status_check
  check (status in ('actief', 'op', 'geblokkeerd', 'verlopen', 'wacht_op_betaling'));

-- Terugvinden op het Mollie-nummer, want daarmee komt de webhook binnen.
create unique index if not exists bwf_cadeaubonnen_betaal_id_idx
  on public.bwf_cadeaubonnen (betaal_id) where betaal_id is not null;

comment on column public.bwf_cadeaubonnen.reden is
  'Waarom een tegoedbon is gegeven: te veel betaald, klacht, of iets anders.';
comment on column public.bwf_cadeaubonnen.reservering_id is
  'De boeking waar de tegoedbon uit voortkomt. Leeg bij een gewone cadeaubon.';
comment on column public.bwf_cadeaubonnen.betaal_id is
  'Het betalingsnummer bij Mollie. De webhook zoekt de bon hierop terug.';

-- ---------------------------------------------------------------------------
-- Een bon die op betaling wacht mag NIET verzilverd worden
-- ---------------------------------------------------------------------------
-- Het scherm controleert dat al, maar het scherm is niet de bewaker: wie de
-- bevraging rechtstreeks aanroept komt daar omheen. Deze trigger weigert het
-- in de database zelf, en dat is de enige plek waar het echt vastligt.
create or replace function public.bwf_bon_mag_gebruikt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_saldo  numeric;
begin
  select status, saldo into v_status, v_saldo
  from public.bwf_cadeaubonnen where id = new.bon_id;

  if v_status = 'wacht_op_betaling' then
    raise exception 'Deze bon is nog niet betaald en kan dus niet worden gebruikt.';
  end if;
  if v_status = 'geblokkeerd' then
    raise exception 'Deze bon is geblokkeerd.';
  end if;
  /* Een negatief bedrag is een terugboeking; die mag altijd, ook als de bon
     op is - anders kun je een fout niet rechtzetten. */
  if new.bedrag > 0 and new.bedrag > v_saldo then
    raise exception 'Er staat nog maar % euro op deze bon.', v_saldo;
  end if;
  return new;
end
$$;

drop trigger if exists bwf_bon_mag_gebruikt_trg on public.bwf_bon_gebruik;
create trigger bwf_bon_mag_gebruikt_trg
  before insert on public.bwf_bon_gebruik
  for each row execute function public.bwf_bon_mag_gebruikt();

-- ---------------------------------------------------------------------------
-- De bon activeren als de betaling binnen is
-- ---------------------------------------------------------------------------
-- Wordt aangeroepen door de webhook. security definer, want de webhook draait
-- zonder ingelogde gebruiker.
-- LET OP de namen van de uitvoerkolommen: bon_code, bon_waarde, bon_status.
-- Ze heetten eerst code, waarde en status - net als de kolommen van de tabel.
-- Een `returns table (...)` maakt die namen tot variabelen, en dan weet
-- PostgreSQL bij `set status = ...` niet meer of je de kolom of de variabele
-- bedoelt: "column reference status is ambiguous". De hele migratie liep daar
-- op stuk, en omdat alles in één transactie zit kwam er niets door - Angela
-- zag op 29-09-2026 "0 van 5" bij de controle terwijl ze hem gedraaid had.
create or replace function public.bwf_bon_betaald(p_betaal_id text)
returns table (bon_code text, bon_waarde numeric, bon_status text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.bwf_cadeaubonnen b
     set status     = case when b.status = 'wacht_op_betaling' then 'actief' else b.status end,
         betaald_op = coalesce(b.betaald_op, now())
   where b.betaal_id = p_betaal_id
  returning b.code, b.waarde, b.status;
end
$$;

comment on function public.bwf_bon_betaald(text) is
  'Zet een bon die op betaling wachtte op actief. Aangeroepen door mollie-webhook.';

commit;

-- ===========================================================================
--  CONTROLE - draai dit erna
-- ===========================================================================
--  1. De vijf nieuwe kolommen.

select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'bwf_cadeaubonnen'
  and column_name in ('reden','reservering_id','betaal_id','betaal_link','betaald_op')
order by column_name;

--  2. Proef: een onbetaalde bon mag niet verzilverd worden.
--     De tweede regel hoort te MISLUKKEN met "nog niet betaald".

-- insert into public.bwf_cadeaubonnen (code, waarde, soort, status)
--   values ('PROEF-ONBETAALD', 50, 'digitaal', 'wacht_op_betaling');
-- insert into public.bwf_bon_gebruik (bon_id, bedrag, door)
--   select id, 10, 'proef' from public.bwf_cadeaubonnen where code = 'PROEF-ONBETAALD';

--  3. Na activeren mag het wel:

-- select * from public.bwf_bon_betaald(null);   -- werkt niet zonder betaal_id
-- update public.bwf_cadeaubonnen set status='actief' where code='PROEF-ONBETAALD';
-- insert into public.bwf_bon_gebruik (bon_id, bedrag, door)
--   select id, 10, 'proef' from public.bwf_cadeaubonnen where code = 'PROEF-ONBETAALD';
-- select code, waarde, saldo, status from public.bwf_cadeaubonnen where code='PROEF-ONBETAALD';
--   -- hier hoort saldo 40 te staan

--  4. Proefbon opruimen:
-- delete from public.bwf_bon_gebruik where bon_id in
--   (select id from public.bwf_cadeaubonnen where code = 'PROEF-ONBETAALD');
-- delete from public.bwf_cadeaubonnen where code = 'PROEF-ONBETAALD';

-- ===========================================================================
--  TERUGDRAAIEN
-- ===========================================================================
--  Zie rollback/20260929100000_tegoedbon_en_betaling_terug.sql
