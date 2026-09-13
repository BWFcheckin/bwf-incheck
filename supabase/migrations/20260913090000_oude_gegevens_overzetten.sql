-- Fase 1-restant — oude reserveringsgegevens overzetten naar `reserveringen`
--
-- Voegt alleen toe en vult alleen lege velden aan. Verwijdert niets:
-- `reservations` en `res_koppeling` blijven ongewijzigd staan.
--
-- 1. reservations  -> reserveringen. Een id dat met 'planyo-' begint wordt
--    kanaal 'planyo' met het Planyo-nummer als kanaal_ref; de rest wordt
--    kanaal 'eigen' met het oude id als kanaal_ref.
--    Overgeslagen: rijen waarvoor al een reservering bestaat met dezelfde suite,
--    dezelfde aankomstdag en dezelfde gastnaam (dat zijn dezelfde boekingen die
--    ook via de import of Planyo zijn binnengekomen).
--    De tabel eist vertrek > aankomst; bij een dagverblijf waar de uitchecktijd
--    vóór de inchecktijd ligt, houden we drie uur aan.
-- 2. res_koppeling -> aanvullen bij de bijbehorende reservering, gevonden op het
--    SMG-nummer of op 'hm-<oud id>'. Een gevulde waarde wordt nooit overschreven.
-- 3. Welkomstcalls die in res_koppeling aan een reservering hingen, krijgen
--    alsnog hun reservering_id.

begin;

-- ---------------------------------------------------------------------------
-- 1. Oude eigen en Planyo-reserveringen
-- ---------------------------------------------------------------------------
with bron as (
  select rs.*,
    case lower(trim(rs.locatie))
      when 'angie'   then 'angie'
      when 'jacuzzi' then 'malina_jacuzzi'
      when 'zwembad' then 'malina_deluxe'
      when 'deluxe'  then 'malina_deluxe'
    end as suite,
    case when rs.id like 'planyo-%' then 'planyo' else 'eigen' end as kanaal,
    case when rs.id like 'planyo-%' then substring(rs.id from 8) else rs.id end as ref,
    case when regexp_match(coalesce(rs.checkintijd, ''), '(\d{1,2})[:.](\d{2})') is not null
         then lpad((regexp_match(coalesce(rs.checkintijd, ''), '(\d{1,2})[:.](\d{2})'))[1], 2, '0') || ':' ||
                   (regexp_match(coalesce(rs.checkintijd, ''), '(\d{1,2})[:.](\d{2})'))[2]
    end as tin,
    case when regexp_match(coalesce(rs.checkuittijd, ''), '(\d{1,2})[:.](\d{2})') is not null
         then lpad((regexp_match(coalesce(rs.checkuittijd, ''), '(\d{1,2})[:.](\d{2})'))[1], 2, '0') || ':' ||
                   (regexp_match(coalesce(rs.checkuittijd, ''), '(\d{1,2})[:.](\d{2})'))[2]
    end as tuit
  from public.reservations rs
),
tijden as (
  select b.*,
    ((b.checkindatum::text || ' ' || coalesce(b.tin, '15:00') || ':00')::timestamp)
      at time zone 'Europe/Amsterdam' as aank,
    ((coalesce(b.checkuitdatum, b.checkindatum)::text || ' ' || coalesce(b.tuit, '11:00') || ':00')::timestamp)
      at time zone 'Europe/Amsterdam' as vert_ruw
  from bron b
  where b.suite is not null and b.checkindatum is not null
),
nieuw as (
  select t.*, greatest(t.vert_ruw, t.aank + interval '3 hours') as vert
  from tijden t
  where not exists (select 1 from public.reserveringen r
                     where r.kanaal = t.kanaal and r.kanaal_ref = t.ref)
    and not exists (
      select 1 from public.reserveringen r
       where r.suite = t.suite
         and (r.aankomst at time zone 'Europe/Amsterdam')::date = t.checkindatum
         and coalesce(t.voornaam, '') || coalesce(t.achternaam, '') <> ''
         and lower(regexp_replace(coalesce(r.gast_voornaam, '') || coalesce(r.gast_achternaam, ''), '[^a-z]', '', 'gi'))
           = lower(regexp_replace(coalesce(t.voornaam, '')     || coalesce(t.achternaam, ''),     '[^a-z]', '', 'gi')))
)
insert into public.reserveringen
  (suite, kanaal, kanaal_ref, status, type, aankomst, vertrek, incheck_tijd, uitcheck_tijd,
   gast_voornaam, gast_achternaam, gast_email, gast_telefoon, arrangementen, omschrijving,
   bedrag_totaal, betaald_bedrag, restant_bedrag, betaalstatus, medewerker, klant_id,
   brongegevens, aangemaakt_door, gewijzigd_door)
select
  n.suite, n.kanaal, n.ref, 'bevestigd',
  case when n.checkuitdatum > n.checkindatum then 'overnachting' else 'dagverblijf' end,
  n.aank, n.vert,
  n.tin::time, n.tuit::time,
  nullif(trim(coalesce(n.voornaam, '')), ''), nullif(trim(coalesce(n.achternaam, '')), ''),
  nullif(lower(trim(coalesce(n.email, ''))), ''), nullif(trim(coalesce(n.telefoon, '')), ''),
  case when coalesce(trim(n.arrangement), '') = '' then '[]'::jsonb
       else jsonb_build_array(jsonb_build_object('naam', trim(n.arrangement))) end,
  nullif(trim(coalesce(n.opmerkingen, '')), ''),
  n.totaal, n.betaald,
  greatest(coalesce(n.totaal, 0) - coalesce(n.betaald, 0), 0),
  case when coalesce(n.totaal, 0) > 0 and coalesce(n.betaald, 0) >= n.totaal then 'betaald'
       when coalesce(n.betaald, 0) > 0 then 'deels'
       else 'open' end,
  nullif(trim(coalesce(n.toegewezen, '')), ''),
  (select kl.id from public.wz_klantbeheer kl where kl.id = n.klant_id),
  'Overgezet uit de oude tabel reservations (id ' || n.id || ') op ' || to_char(now(), 'DD-MM-YYYY'),
  'migratie-oude-gegevens', 'migratie-oude-gegevens'
from nieuw n
on conflict (kanaal, kanaal_ref) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Extra gegevens uit res_koppeling bij de juiste reservering zetten
--    Alleen lege velden; koppelingen alleen als de rij waarnaar verwezen wordt bestaat.
-- ---------------------------------------------------------------------------
with kop as (
  select k.*,
    coalesce(
      (select r.id from public.reserveringen r
        where r.kanaal = 'smg' and r.kanaal_ref = k.res_sleutel limit 1),
      (select r.id from public.reserveringen r
        where r.kanaal = 'eigen' and 'hm-' || r.kanaal_ref = k.res_sleutel limit 1)
    ) as res_id
  from public.res_koppeling k
)
update public.reserveringen r set
  klant_id       = coalesce(r.klant_id,      (select kl.id from public.wz_klantbeheer kl where kl.id = kop.klant_id)),
  checkin_id     = coalesce(r.checkin_id,    (select c.id  from public.checkins c      where c.id  = kop.checkin_id)),
  notitie        = coalesce(r.notitie,       nullif(trim(coalesce(kop.notitie, '')), '')),
  medewerker     = coalesce(r.medewerker,    nullif(trim(coalesce(kop.medewerker, '')), '')),
  gast_email     = coalesce(r.gast_email,    nullif(lower(trim(coalesce(kop.email, ''))), '')),
  gast_telefoon  = coalesce(r.gast_telefoon, nullif(trim(coalesce(kop.telefoon, '')), '')),
  bedrag_totaal  = coalesce(r.bedrag_totaal, kop.totaal),
  betaald_bedrag = coalesce(r.betaald_bedrag, kop.betaald),
  borg_bedrag    = coalesce(r.borg_bedrag,    nullif(kop.borg_bedrag, 0)),
  borg_wijze     = coalesce(r.borg_wijze,     nullif(trim(coalesce(kop.borg_wijze, '')), '')),
  borg_ontvangen = coalesce(r.borg_ontvangen, kop.borg_ontvangen),
  borg_terug     = coalesce(r.borg_terug,     kop.borg_terug),
  borg_ingehouden = coalesce(r.borg_ingehouden, kop.borg_ingehouden),
  borg_afgehandeld = coalesce(r.borg_afgehandeld, kop.borg_afgehandeld),
  borg_notitie   = coalesce(r.borg_notitie,   nullif(trim(coalesce(kop.borg_notitie, '')), '')),
  review_verstuurd = coalesce(r.review_verstuurd, kop.review_verstuurd),
  review_taak_id = coalesce(r.review_taak_id, nullif(trim(coalesce(kop.review_taak_id, '')), '')),
  gewijzigd_door = 'migratie-oude-gegevens'
from kop
where kop.res_id = r.id
  and (
    (r.klant_id is null and kop.klant_id is not null) or
    (r.checkin_id is null and kop.checkin_id is not null) or
    (r.notitie is null and coalesce(trim(kop.notitie), '') <> '') or
    (r.medewerker is null and coalesce(trim(kop.medewerker), '') <> '') or
    (r.gast_email is null and coalesce(trim(kop.email), '') <> '') or
    (r.gast_telefoon is null and coalesce(trim(kop.telefoon), '') <> '') or
    (r.bedrag_totaal is null and kop.totaal is not null) or
    (r.betaald_bedrag is null and kop.betaald is not null) or
    (r.borg_bedrag is null and coalesce(kop.borg_bedrag, 0) <> 0) or
    (r.review_verstuurd is null and kop.review_verstuurd is not null)
  );

-- ---------------------------------------------------------------------------
-- 3. Welkomstcalls uit res_koppeling alsnog aan hun reservering hangen
-- ---------------------------------------------------------------------------
update public.wz_welkomstcalls c
   set reservering_id = r.id
  from public.res_koppeling k
  join public.reserveringen r on r.kanaal = 'smg' and r.kanaal_ref = k.res_sleutel
 where c.reservering_id is null
   and k.welkomstcall_id is not null
   and c.id::text = k.welkomstcall_id
   and not exists (select 1 from public.wz_welkomstcalls b where b.reservering_id = r.id);

commit;
