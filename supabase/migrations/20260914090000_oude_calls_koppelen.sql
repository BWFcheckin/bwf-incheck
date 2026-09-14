-- Oude welkomstcalls alsnog aan hun reservering hangen (wens Angela 14-09-2026)
--
-- Sinds fase 4 hangt een welkomstcall met reservering_id aan de boeking. Calls
-- van vóór die tijd staan los, waardoor de notities en bijgeboekte extra's niet
-- op de reserveringskaart verschijnen.
--
-- Gekoppeld wordt alleen wat onmiskenbaar is:
--   * de genormaliseerde gastnaam is gelijk (alleen letters, hoofdletters weg);
--   * de datum van de call is de aankomstdag van de reservering;
--   * de reservering is niet geannuleerd;
--   * de call matcht precies één reservering;
--   * die reservering heeft nog geen andere call (er mag er maar één zijn).
-- Verwijdert niets en overschrijft geen bestaande koppeling.

begin;

with los as (
  select c.id, c.datum,
    lower(regexp_replace(coalesce(c.naam, ''), '[^a-z]', '', 'gi')) as nsleutel
  from public.wz_welkomstcalls c
  where c.reservering_id is null
),
res as (
  select r.id, (r.aankomst at time zone 'Europe/Amsterdam')::date as dag,
    lower(regexp_replace(coalesce(r.gast_voornaam, '') || coalesce(r.gast_achternaam, ''), '[^a-z]', '', 'gi')) as nsleutel
  from public.reserveringen r
  where r.status <> 'geannuleerd'
),
paar as (
  select l.id as call_id, r.id as res_id
  from los l
  join res r on r.nsleutel = l.nsleutel and r.dag = l.datum
  where l.nsleutel <> ''
    and not exists (select 1 from public.wz_welkomstcalls b where b.reservering_id = r.id)
),
eenduidig as (
  /* de call mag maar één reservering matchen ... */
  select call_id, res_id from paar
  where call_id in (select call_id from paar group by call_id having count(*) = 1)
),
uniek as (
  /* ... en per reservering koppelen we hooguit één call */
  select distinct on (res_id) call_id, res_id
  from eenduidig
  order by res_id, call_id
)
update public.wz_welkomstcalls c
   set reservering_id = u.res_id,
       bijgewerkt = now()
  from uniek u
 where c.id = u.call_id;

commit;
