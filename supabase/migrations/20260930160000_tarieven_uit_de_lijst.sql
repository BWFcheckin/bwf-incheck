-- Zes tarieven uit de lijst halen
-- ---------------------------------------------------------------------------
-- Angela, 30-09-2026: "kun je deze items uit de lijst verwijderen: opslag menu
-- optie, opslag arrangement, acquisitiegesprek bedrijf, flyers plaatsen,
-- contentplanning, social media reacties."
--
-- Ze gaan op actief = false, niet weg. Twee redenen:
--
--   1. Er kunnen al werkzaamheden aan hangen (wz_werkzaamheden.tarief_id).
--      Bij een echte delete raken die regels hun herkomst kwijt of weigert de
--      database het hele statement, afhankelijk van de foreign key.
--   2. Angela's eigen regel: verwijder niets.
--
-- Wat er verandert: ze verdwijnen uit elke keuzelijst - het
-- werkzaamheden-overzicht van Kelly en het tabblad Werk & tarieven in vr2
-- filteren allebei op actief. Terugzetten is één update.
--
-- Herhaalbaar: twee keer draaien geeft hetzelfde resultaat.

begin;

update public.wz_tarieven
   set actief = false
 where taak in ('Opslag menu-optie',
                'Opslag arrangement',
                'Acquisitiegesprek bedrijf',
                'Flyers plaatsen',
                'Contentplanning maand',
                'Social media reacties')
   and actief is distinct from false;

commit;

-- Controle: hoort 6 regels te geven, allemaal actief = false
--   select taak, categorie, actief
--     from public.wz_tarieven
--    where taak in ('Opslag menu-optie','Opslag arrangement',
--                   'Acquisitiegesprek bedrijf','Flyers plaatsen',
--                   'Contentplanning maand','Social media reacties')
--    order by taak;
--
-- En wat er OVERBLIJFT in de lijst:
--   select taak, categorie, eenheid, tarief
--     from public.wz_tarieven where actief is not false order by sortering;
--
-- Terugzetten: zie rollback/20260930160000_terug.sql
