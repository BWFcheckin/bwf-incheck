-- Terugdraaien van 20260930160000_tarieven_uit_de_lijst.sql
-- Zet de zes tarieven weer in de lijst.

begin;

update public.wz_tarieven
   set actief = true
 where taak in ('Opslag menu-optie',
                'Opslag arrangement',
                'Acquisitiegesprek bedrijf',
                'Flyers plaatsen',
                'Contentplanning maand',
                'Social media reacties');

commit;
