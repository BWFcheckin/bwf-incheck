-- Lidnummers voor de members die er al waren
-- ---------------------------------------------------------------------------
-- Aanvulling op 20260928160000_membership.sql. Die migratie gaf bestaande
-- members wel een begindatum en een niveau, maar GEEN lidnummer - dat kon toen
-- niet, want het nummer wordt in het scherm toegekend en er was nog geen
-- scherm. Gevolg: iedereen die vóór vandaag al als member stond aangevinkt
-- heeft een leeg lidnummer, en Kelly kan zo'n gast aan de balie niet
-- terugvinden op nummer.
--
-- Dit script deelt die nummers alsnog uit.
--
-- IN WELKE VOLGORDE
-- Wie het langst lid is krijgt het laagste nummer. Dat is de volgorde die een
-- mens verwacht, en hij is reproduceerbaar: bij een gelijke begindatum telt
-- wanneer de klant is aangemaakt, en daarna het id. Draai je dit script twee
-- keer, dan verandert er niets meer - wie al een nummer heeft wordt
-- overgeslagen.
--
-- WAAR BEGINT HET TE TELLEN
-- Bij het hoogste nummer dat al vergeven is, en anders bij de instelling
-- member_nummer_start (staat op 1001). Zo botst het nooit met nummers die het
-- scherm inmiddels heeft uitgedeeld.
--
-- Er wordt niets verwijderd en geen bestaand nummer overschreven.

begin;

with vanaf as (
  select greatest(
    /* het hoogste nummer dat al vergeven is; alleen de cijfers tellen mee,
       zodat een nummer als "BWF-1004" ook goed valt */
    coalesce((
      select max(nullif(regexp_replace(member_nummer, '\D', '', 'g'), '')::bigint)
      from public.wz_klantbeheer
      where member_nummer is not null
    ), 0),
    /* of de ingestelde startwaarde, min een: het eerste uitgedeelde nummer
       wordt vanaf + 1 */
    coalesce((
      select nullif(regexp_replace(waarde, '\D', '', 'g'), '')::bigint - 1
      from public.instellingen
      where sleutel = 'member_nummer_start'
    ), 1000)
  ) as n
),
genummerd as (
  select id,
         row_number() over (
           order by member_sinds nulls last, aangemaakt nulls last, id
         ) as plek
  from public.wz_klantbeheer
  where member = true
    and member_nummer is null
)
update public.wz_klantbeheer k
   set member_nummer = ((select n from vanaf) + g.plek)::text,
       member_niveau = coalesce(k.member_niveau, 'basis')
  from genummerd g
 where k.id = g.id;

commit;

-- ===========================================================================
--  CONTROLE - draai dit erna
-- ===========================================================================
--  1. Hier hoort 0 uit te komen: geen enkele member zonder lidnummer.

select count(*) as members_zonder_lidnummer
from public.wz_klantbeheer
where member = true and member_nummer is null;

--  2. En hier ook 0: geen twee klanten met hetzelfde nummer.

select count(*) as dubbele_nummers from (
  select member_nummer from public.wz_klantbeheer
  where member_nummer is not null
  group by member_nummer having count(*) > 1
) x;

--  3. De ledenlijst zoals Kelly hem straks ziet.

select member_nummer, voornaam, achternaam, email, member_sinds, member_gestopt
from public.wz_klantbeheer
where member = true
order by nullif(regexp_replace(member_nummer, '\D', '', 'g'), '')::bigint;

-- ===========================================================================
--  TERUGDRAAIEN
-- ===========================================================================
--  Alleen de nummers die dit script heeft uitgedeeld weer leegmaken kan niet
--  worden onderscheiden van nummers die het scherm heeft gegeven. Wil je
--  helemaal opnieuw beginnen met nummeren:
--
--  update public.wz_klantbeheer set member_nummer = null where member = true;
--
--  Daarna dit script opnieuw draaien. Bewust uitgecommentarieerd.
