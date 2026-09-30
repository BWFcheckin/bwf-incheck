-- Dagtarief voor de app: van EUR 2,50 naar EUR 5,00
-- ---------------------------------------------------------------------------
-- Angela, 30-09-2026: "Dag tarief voor app beantwoord 5 euro".
--
-- Mijn voorstel van vanochtend was EUR 2,50; dat wordt het dubbele. Bij vijf
-- dagen per week komt dat neer op ongeveer EUR 108 per maand in plaats van
-- EUR 54.
--
-- Al geregistreerde dagen veranderen NIET. Die hebben hun bedrag vastgelegd
-- in wz_werkzaamheden.bedrag toen ze werden afgevinkt; dat hoort zo, anders
-- zou een tariefwijziging met terugwerkende kracht de uitbetaling van vorige
-- maand veranderen. Wil je de al afgevinkte dagen wel bijstellen, zeg het dan
-- - dat is een apart statement.
--
-- Er wordt niets verwijderd. Twee keer draaien geeft hetzelfde resultaat.

begin;

update public.wz_tarieven
   set tarief = 5.00
 where taak = 'Appjes van gasten beantwoord';

commit;

-- Controle:
--   select taak, eenheid, tarief from public.wz_tarieven
--    where taak = 'Appjes van gasten beantwoord';
--   Verwacht: 1 regel, dag, 5.00
--
-- Terugdraaien: update ... set tarief = 2.50 where taak = 'Appjes van gasten beantwoord';
