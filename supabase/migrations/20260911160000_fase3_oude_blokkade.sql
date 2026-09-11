-- Fase 3 · eenmalig — oude blokkades uit res_koppeling overzetten naar blokkades
-- Blokkades die vóór 11-09-2026 via agenda.html of reservering-aanmaken.html zijn gemaakt, staan in
-- res_koppeling (bron 'blokkade', sleutel blok-<suite>-<tijd>). De nieuwe agenda leest alleen blokkades.
-- res_koppeling blijft ongewijzigd (oude pagina's lezen daar tot fase 4 nog uit). Verwijdert niets.
-- Al overgezette regels (zelfde bron_uid) worden overgeslagen.
begin;

insert into public.blokkades (suite, van, tot, reden, bron, bron_uid, aangemaakt_door, actief)
select case
         when k.res_sleutel like 'blok-deluxe-%' or k.res_sleutel like 'blok-zwembad-%' then 'malina_deluxe'
         when k.res_sleutel like 'blok-jacuzzi-%' then 'malina_jacuzzi'
         when k.res_sleutel like 'blok-angie-%'   then 'angie'
       end,
       (k.aankomst + coalesce(nullif(k.tijd_in, ''), '00:00')::time) at time zone 'Europe/Amsterdam',
       (coalesce(k.vertrek, k.aankomst) + coalesce(nullif(k.tijd_uit, ''), '23:59')::time) at time zone 'Europe/Amsterdam',
       coalesce(nullif(k.gast, ''), 'Niet beschikbaar'),
       'handmatig',
       k.res_sleutel,
       'overgezet uit res_koppeling',
       true
  from public.res_koppeling k
 where k.bron = 'blokkade'
   and k.geannuleerd is null
   and not exists (select 1 from public.blokkades b where b.bron_uid = k.res_sleutel);

-- Controle: elke oude blokkade staat nu ook in blokkades
do $$
begin
  if (select count(*) from public.res_koppeling where bron = 'blokkade' and geannuleerd is null)
     <> (select count(*) from public.blokkades where bron = 'handmatig' and bron_uid like 'blok-%') then
    raise exception 'Niet alle oude blokkades zijn overgezet';
  end if;
end
$$;

commit;
