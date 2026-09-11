-- Fase 2 · eenmalig — dubbele rijen van de importrun van 12:30 opruimen en vaste sleutels invoeren
-- Oorzaak: SMG geeft handmatige planningsregels bij elke download een nieuwe UID, waardoor de run van
-- 12:30 (11-09-2026) alle 88 handmatige regels en 12 SMG-blokkades opnieuw aanmaakte en 11 toekomstige
-- regels uit de run van 12:28 annuleerde.
-- Vooraf: export van reserveringen en blokkades naar exports/2026-09-11-opruimen/ (niet in git).
-- Na migratie 7 uitvoeren, vóór de nieuwe versie van kanalen-sync weer draait.
--  1. Verwijdert de 88 reserveringen (smg-regel) en 12 blokkades (ics-smg) die om 12:30 zijn aangemaakt.
--  2. Geeft de overgebleven rijen de vaste sleutel die kanalen-sync vanaf nu gebruikt:
--     smg-regel:<suite>:<begin JJJJMMDDUUMM>-<eind JJJJMMDDUUMM>  (bij gelijke tijden #2, #3 op volgorde van titel)
--     smg-blok:<suite>:<begin>-<eind>
--  3. Zet de 11 door de import geannuleerde reserveringen terug op bevestigd.
begin;

-- controle vooraf: precies de toestand uit de diagnose, en nog niets handmatig gewijzigd
do $$
begin
  if (select count(*) from public.reserveringen where kanaal_ref like 'smg-regel:%' and created_at >= '2026-09-11 10:29:00+00') <> 88 then
    raise exception 'Verwacht 88 dubbele reserveringen van 12:30';
  end if;
  if (select count(*) from public.blokkades where bron = 'ics-smg' and created_at >= '2026-09-11 10:29:00+00') <> 12 then
    raise exception 'Verwacht 12 dubbele blokkades van 12:30';
  end if;
  if exists (select 1 from public.reserveringen where handmatig_gewijzigd_op is not null
                or (gewijzigd_door is not null and gewijzigd_door <> 'kanalen-sync')) then
    raise exception 'Er zijn al handmatig gewijzigde reserveringen: eerst bekijken';
  end if;
end
$$;

-- 1. dubbele rijen van 12:30
delete from public.reserveringen
 where kanaal_ref like 'smg-regel:%' and created_at >= '2026-09-11 10:29:00+00';
delete from public.blokkades
 where bron = 'ics-smg' and created_at >= '2026-09-11 10:29:00+00';

-- 2 en 3. vaste sleutels en onterechte annuleringen terugzetten
with n as (
  select id,
         'smg-regel:' || suite || ':'
           || to_char(aankomst at time zone 'Europe/Amsterdam', 'YYYYMMDDHH24MI') || '-'
           || to_char(vertrek  at time zone 'Europe/Amsterdam', 'YYYYMMDDHH24MI') as basis,
         row_number() over (partition by suite, aankomst, vertrek order by coalesce(brongegevens, '') collate "C") as nr
    from public.reserveringen
   where kanaal_ref like 'smg-regel:%'
)
update public.reserveringen r
   set kanaal_ref              = n.basis || case when n.nr > 1 then '#' || n.nr else '' end,
       bron_uid                = n.basis || case when n.nr > 1 then '#' || n.nr else '' end,
       status                  = case when r.geannuleerd_door_import then 'bevestigd' else r.status end,
       geannuleerd_door_import = false
  from n
 where r.id = n.id;

with n as (
  select id,
         'smg-blok:' || suite || ':'
           || to_char(van at time zone 'Europe/Amsterdam', 'YYYYMMDDHH24MI') || '-'
           || to_char(tot at time zone 'Europe/Amsterdam', 'YYYYMMDDHH24MI') as basis,
         row_number() over (partition by suite, van, tot
                            order by (case when reden = 'SMG: niet beschikbaar' then '' else coalesce(reden, '') end) collate "C") as nr
    from public.blokkades
   where bron = 'ics-smg'
)
update public.blokkades b
   set bron_uid = n.basis || case when n.nr > 1 then '#' || n.nr else '' end
  from n
 where b.id = n.id;

-- controle achteraf: terug naar de stand van de eerste import
do $$
begin
  if (select count(*) from public.reserveringen) <> 131 then
    raise exception 'Verwacht 131 reserveringen, gevonden %', (select count(*) from public.reserveringen);
  end if;
  if (select count(*) from public.reserveringen where status = 'geannuleerd') <> 0 then
    raise exception 'Nog geannuleerde reserveringen';
  end if;
  if (select count(*) from public.blokkades where actief) <> 14 then
    raise exception 'Verwacht 14 actieve blokkades, gevonden %', (select count(*) from public.blokkades where actief);
  end if;
end
$$;

commit;
