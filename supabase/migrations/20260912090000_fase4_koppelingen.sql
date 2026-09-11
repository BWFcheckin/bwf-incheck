-- Fase 4 — koppelvelden: welkomstcall, borg en schade aan `reserveringen`
-- Alleen toevoegen. Er wordt niets verwijderd of leeggemaakt.
-- res_koppeling, de kolommen daarvan en de oude indexen blijven staan.

begin;

-- 1. Welkomstcall aan een reservering hangen (nu alleen vrije tekst in `referentie`)
alter table public.wz_welkomstcalls
  add column if not exists reservering_id uuid references public.reserveringen(id) on delete set null,
  add column if not exists uitkomst text;   -- fijnmazige uitslag uit vandaag.html:
                                            -- geen gehoor / terugbellen / nummer klopt niet / wil niet gebeld worden

comment on column public.wz_welkomstcalls.reservering_id is
  'Vaste koppeling aan reserveringen.id. Vervangt het zoeken op referentie/naam/datum.';
comment on column public.wz_welkomstcalls.uitkomst is
  'Uitslag van het belpogen; status blijft te bellen / gebeld / afgerond.';

-- één welkomstcall per reservering, zodat upsert op reservering_id kan en dubbele calls niet meer kunnen
create unique index if not exists wz_welkomstcalls_reservering_uniek
  on public.wz_welkomstcalls (reservering_id) where reservering_id is not null;

-- 2. Schade aan een reservering hangen (nu res_sleutel; tabel is leeg)
alter table public.schade
  add column if not exists reservering_id uuid references public.reserveringen(id) on delete set null;
create index if not exists schade_reservering_idx on public.schade (reservering_id);

-- 3. Velden uit res_koppeling die nog geen plek hebben op `reserveringen`
alter table public.reserveringen
  add column if not exists borg_bedrag numeric,
  add column if not exists borg_wijze text,
  add column if not exists borg_ontvangen date,
  add column if not exists borg_terug numeric,
  add column if not exists borg_ingehouden numeric,
  add column if not exists borg_afgehandeld date,
  add column if not exists borg_notitie text,
  add column if not exists betaald_bedrag numeric,   -- naast bedrag_totaal en restant_bedrag
  add column if not exists notitie text,             -- interne notitie, los van omschrijving (= uit de boeking)
  add column if not exists medewerker text,          -- toegewezen medewerker (wz_medewerkers.id)
  add column if not exists geannuleerd_op date,
  add column if not exists review_taak_id text,
  add column if not exists review_verstuurd date,
  add column if not exists gastlink_verstuurd date;

comment on column public.reserveringen.notitie is
  'Interne notitie van het team. `omschrijving` blijft de tekst uit de boeking.';
comment on column public.reserveringen.betaald_bedrag is
  'Al betaald bedrag. bedrag_totaal min betaald_bedrag hoort gelijk te zijn aan restant_bedrag.';

-- 4. Bestaande welkomstcalls koppelen waar het SMG-nummer overeenkomt (alleen invullen, niets overschrijven)
with treffer as (
  select c.id as call_id, r.id as res_id
  from public.wz_welkomstcalls c
  join public.reserveringen r
    on r.kanaal_ref = coalesce(nullif(c.res_sleutel, ''), nullif(c.referentie, ''))
  where c.reservering_id is null
    and coalesce(nullif(c.res_sleutel, ''), nullif(c.referentie, '')) ~ '^[0-9]{5,8}$'
)
update public.wz_welkomstcalls c
   set reservering_id = t.res_id
  from treffer t
 where c.id = t.call_id
   and not exists (select 1 from public.wz_welkomstcalls b
                    where b.reservering_id = t.res_id);   -- nooit twee calls op dezelfde reservering

-- 5. En de omgekeerde verwijzing invullen waar die nog leeg is
update public.reserveringen r
   set welkomstcall_id = c.id
  from public.wz_welkomstcalls c
 where c.reservering_id = r.id
   and r.welkomstcall_id is null;

commit;
