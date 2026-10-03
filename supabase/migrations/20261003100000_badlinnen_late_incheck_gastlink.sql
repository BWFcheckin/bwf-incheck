-- Badlinnenpakket, late incheck en de gastlink die gegevens voorvult
-- ---------------------------------------------------------------------------
-- Angela, 02 en 03-10-2026. Drie dingen in één keer:
--
--   1. Badlinnenpakket, extra set handdoeken, EUR 20
--   2. Later aankomen doorgeven; na 22:00 EUR 25 per uur tot uiterlijk 00:00
--   3. De gastlink weer laten werken, zodat het gastformulier de naam, het
--      e-mailadres en het telefoonnummer al ingevuld heeft
--
-- Punt 3 vraagt uitleg. De gastgegevens worden NU NIET voorgevuld. De link die
-- wordt meegestuurd bevat alleen suite en datum:
--
--     gast-incheck.html?r=SMG-9001&loc=angie&d=2026-10-05
--
-- Er bestond een veilige variant met een token, maar die liep via een edge
-- function die sinds een Supabase-wijziging een inlogsleutel eist die de
-- gastpagina niet meestuurt. Gemeten op 02-10-2026: elke aanroep geeft
-- UNAUTHORIZED_NO_AUTH_HEADER. Dat pad is dus dood.
--
-- De gegevens in de link zetten is geen optie: zo'n link gaat via WhatsApp
-- rond, komt in browsergeschiedenis en voorvertoningen terecht, en iedereen
-- die hem doorstuurt deelt het telefoonnummer en e-mailadres van die gast mee.
--
-- Daarom hieronder twee databasefuncties. De gastpagina wisselt een token in
-- voor de gegevens van één reservering - meer krijgt hij niet, en zonder geldig
-- token krijgt hij niets. Het token is 32 willekeurige bytes en verloopt.
--
-- ER WORDT NIETS VERWIJDERD. Alles is herhaalbaar.

begin;

-- ===========================================================================
-- 1. Badlinnenpakket
-- ===========================================================================
insert into public.wz_extras (naam, categorie, prijs, per_persoon, omschrijving, actief, sortering, locatie)
select 'Badlinnenpakket extra', 'Service', 20.00, false,
       'Een extra set handdoeken en badlinnen', true, 100, null
 where not exists (select 1 from public.wz_extras where naam = 'Badlinnenpakket extra');

-- ===========================================================================
-- 2. Later aankomen
-- ===========================================================================
-- In wz_extras één regel van EUR 25: het aantal is het aantal uren na 22:00.
-- Eén uur later is EUR 25, twee uur is EUR 50, en verder dan 00:00 gaat niet.
insert into public.wz_extras (naam, categorie, prijs, per_persoon, omschrijving, actief, sortering, locatie)
select 'Late incheck na 22:00', 'Service', 25.00, false,
       'Per uur na 22:00, tot uiterlijk 00:00. Aantal = aantal uren.',
       true, 110, null
 where not exists (select 1 from public.wz_extras where naam = 'Late incheck na 22:00');

-- ===========================================================================
-- 3. De lijst die de gast ziet
-- ===========================================================================
-- Eén rij met een jsonb-lijst. Staat die gevuld, dan overschrijft hij de lijst
-- die in gast-incheck.html is ingebouwd.
--
-- "Later aankomen" gebruikt het variantenmechanisme dat er al is: de gast kiest
-- een tijdvak en de prijs rolt eruit. Vóór 22:00 kost niets maar staat er wel
-- bij, want dan weet de locatiemanager hoe laat hij iemand kan verwachten -
-- dat is de helft van wat Angela vroeg.
update public.gast_catalogus
   set data = data || jsonb_build_array(jsonb_build_object(
         'id',        'srv_badlinnen',
         'groep',     'srv',
         'naam',      'Badlinnenpakket extra',
         'prijs',     20,
         'suites',    jsonb_build_array('angie','jacuzzi','deluxe'),
         'maxAantal', 4,
         'oms',       'Een extra set handdoeken en badlinnen.'
       ))
 where id = 'standaard'
   and not (data @> '[{"id":"srv_badlinnen"}]'::jsonb);

update public.gast_catalogus
   set data = data || jsonb_build_array(jsonb_build_object(
         'id',        'srv_laat',
         'groep',     'srv',
         'naam',      'Later aankomen',
         'prijs',     0,
         'suites',    jsonb_build_array('angie','jacuzzi','deluxe'),
         'maxAantal', 1,
         'oms',       'Geef door hoe laat je verwacht aan te komen. Tot 22:00 kost dat niets. Daarna rekenen we EUR 25 per uur; later dan 00:00 inchecken kan niet.',
         'varianten', jsonb_build_array(
            jsonb_build_object('id','voor22','naam','Voor 22:00 - geen kosten','prijs',0),
            jsonb_build_object('id','tot23', 'naam','Tussen 22:00 en 23:00 - EUR 25','prijs',25),
            jsonb_build_object('id','tot24', 'naam','Tussen 23:00 en 00:00 - EUR 50','prijs',50))
       ))
 where id = 'standaard'
   and not (data @> '[{"id":"srv_laat"}]'::jsonb);

-- ===========================================================================
-- 4. De gastlink
-- ===========================================================================
create table if not exists public.bwf_gastlink (
  token          text primary key,
  reservering_id uuid not null references public.reserveringen(id) on delete cascade,
  aangemaakt_op  timestamptz not null default now(),
  verloopt_op    timestamptz not null default now() + interval '90 days'
);
create index if not exists bwf_gastlink_res_idx on public.bwf_gastlink (reservering_id);

alter table public.bwf_gastlink enable row level security;

-- Geen enkele policy: niemand leest of schrijft deze tabel rechtstreeks, ook
-- geen ingelogde medewerker. Alles loopt via de twee functies hieronder, die
-- security definer zijn. Zo kan een token nooit uitlekken via een gewone
-- query, en kan een gast niet de tokens van andere gasten opvragen.

-- --- een link maken: alleen voor wie is ingelogd en een toegangsrol heeft ---
create or replace function public.bwf_gastlink_maak(p_reservering uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if (select public.bwf_toegangsrol()) is null then
    raise exception 'Geen toegang.';
  end if;

  -- Bestaat er al een geldige link voor deze boeking, geef die dan terug.
  -- Anders zou elke keer dat je een bevestiging opstelt een nieuwe link
  -- ontstaan, en werkte de link in een eerder verstuurd bericht nog wel maar
  -- stonden er tien rijen per boeking.
  select token into v_token
    from public.bwf_gastlink
   where reservering_id = p_reservering
     and verloopt_op > now()
   order by aangemaakt_op desc
   limit 1;
  if v_token is not null then
    return v_token;
  end if;

  -- Twee uuid's aan elkaar: 64 hextekens, 256 bits willekeur. Bewust niet
  -- gen_random_bytes(): dat hangt aan de pgcrypto-extensie en die staat in
  -- Supabase in een eigen schema, wat met `search_path = ''` misgaat.
  -- gen_random_uuid() zit sinds PostgreSQL 13 gewoon in pg_catalog.
  v_token := replace(pg_catalog.gen_random_uuid()::text, '-', '') ||
             replace(pg_catalog.gen_random_uuid()::text, '-', '');
  insert into public.bwf_gastlink (token, reservering_id)
  values (v_token, p_reservering);
  return v_token;
end;
$$;

-- --- een link openen: mag iedereen, maar alleen met een geldig token ---
create or replace function public.bwf_gastlink_open(p_token text)
returns table (
  reservering_id text,
  suite          text,
  aankomst       text,
  incheck_tijd   text,
  voornaam       text,
  achternaam     text,
  email          text,
  telefoon       text,
  personen       text,
  soort          text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id::text,
         r.suite::text,
         left(r.aankomst::text, 10),
         left(coalesce(r.incheck_tijd::text, ''), 5),
         coalesce(r.gast_voornaam, ''),
         coalesce(r.gast_achternaam, ''),
         coalesce(r.gast_email, ''),
         coalesce(r.gast_telefoon, ''),
         coalesce(r.personen::text, ''),
         coalesce(r.type::text, '')
    from public.bwf_gastlink g
    join public.reserveringen r on r.id = g.reservering_id
   where g.token = p_token
     and g.verloopt_op > now()
     and r.geannuleerd_op is null
   limit 1;
$$;

revoke execute on function public.bwf_gastlink_maak(uuid) from public, anon;
grant  execute on function public.bwf_gastlink_maak(uuid) to authenticated, service_role;

revoke execute on function public.bwf_gastlink_open(text) from public;
grant  execute on function public.bwf_gastlink_open(text) to anon, authenticated, service_role;

commit;

-- ===========================================================================
-- Controleren
-- ===========================================================================
-- 1 en 2 - hoort 2 regels te geven:
--   select naam, categorie, prijs, actief from public.wz_extras
--    where naam in ('Badlinnenpakket extra','Late incheck na 22:00');
--
-- 3 - hoort 2 regels te geven:
--   select x->>'naam' as naam, x->>'prijs' as prijs
--     from public.gast_catalogus, jsonb_array_elements(data) as x
--    where id = 'standaard' and x->>'id' in ('srv_badlinnen','srv_laat');
--
--   Komt dit leeg terwijl de rij bestaat, dan stonden ze er al. Bestaat de rij
--   'standaard' niet, dan gebruikt het gastformulier zijn ingebouwde lijst en
--   is dit deel niet nodig.
--
-- 4 - de proef op de som. Neem een bestaand reservering-id en draai:
--
--   select public.bwf_gastlink_maak('PLAK-HIER-EEN-RESERVERING-ID'::uuid);
--
--   Dat geeft een token van 64 tekens. Daarmee:
--
--   select * from public.bwf_gastlink_open('PLAK-HIER-HET-TOKEN');
--
--   Verwacht: één regel met de naam, het e-mailadres en het telefoonnummer van
--   die gast. En de tegenproef, die niets hoort te geven:
--
--   select * from public.bwf_gastlink_open('bestaatniet');
--
-- Terugdraaien: zie rollback/20261003100000_terug.sql
