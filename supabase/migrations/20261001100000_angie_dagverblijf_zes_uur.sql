-- Angie dagverblijf: blok van zes uur erbij
-- ---------------------------------------------------------------------------
-- Angela, 01-10-2026: "ik wil dat extra uren boven op de standaard prijs vanaf
-- 6 uur 50 extra per uur wordt."
--
-- Het dagverblijf liep tot nu toe tot vijf uur (13:00-18:00, EUR 299). Het
-- zesde uur kost EUR 50 bovenop die prijs: EUR 349. Binnen de openingstijden
-- van het dagverblijf (12:00-18:00) past precies één blok van zes uur.
--
-- Er komt één regel bij; bestaande regels blijven zoals ze zijn. Het blok
-- verschijnt in de keuzelijst bij Reserveringen > Nieuwe reservering zodra de
-- suite op Angie staat.
--
-- Herhaalbaar: de tabel heeft een unieke sleutel op suite, verblijf, dagtype,
-- naam en tijden, dus een tweede keer draaien voegt niets toe.

begin;

insert into public.bwf_tariefblokken
       (suite,   verblijf, dagtype, naam,          starttijd, eindtijd, prijs, sortering, actief)
values ('angie', 'dag',    'alle',  'Dagverblijf', '12:00',   '18:00',  349,   80,        true)
on conflict (suite, verblijf, dagtype, naam, starttijd, eindtijd) do nothing;

commit;

-- Controle: hoort 8 regels te geven, de laatste 12:00-18:00 voor 349
--   select id, starttijd, eindtijd, prijs, sortering, actief
--     from public.bwf_tariefblokken
--    where suite = 'angie' and verblijf = 'dag'
--    order by sortering;
--
-- Terugzetten: zie rollback/20261001100000_angie_dagverblijf_zes_uur_terug.sql
