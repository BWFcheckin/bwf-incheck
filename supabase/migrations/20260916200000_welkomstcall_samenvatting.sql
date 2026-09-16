-- Welkomstcall: een eigen veld voor de samenvatting van het gesprek
--
-- Aanleiding: Angela wil op de reserveringskaart alleen zien óf er gebeld is en
-- een korte samenvatting van wat er is bijgeboekt, in plaats van dat de kaart
-- het volledige welkomstcall-scherm opent. Bij de welkomstcall komt daarvoor
-- een knop "Gesprek samenvatten", die ook bruikbaar is als er geen call nodig
-- was of als er niets is bijgeboekt.
--
-- Waarom een nieuw veld en geen bestaand hergebruikt (nagekeken 16-09-2026):
--   * 'samenvatting' bestond nog niet.
--   * 'uitkomst' lijkt vrij maar is het NIET: vandaag.html leest dat veld op
--     drie plekken als de uitkomst van de call en schrijft het ook weg, en er
--     staat data in (3 rijen). Hergebruik zou stilzwijgend andermans gegevens
--     overschrijven.
--   * 'notitie', 'notities' en 'bijzonderheden' zijn losse aantekeningen die al
--     als "Besproken" op de reserveringskaart staan. Een samenvatting is iets
--     anders dan ruwe aantekeningen, en die twee door elkaar halen maakt beide
--     onbetrouwbaar.
--
-- Alleen toevoegen. Niets wordt gewijzigd of verwijderd, en het veld mag leeg
-- blijven: bestaande calls houden gewoon wat ze hebben.

begin;

alter table public.wz_welkomstcalls
  add column if not exists samenvatting text;

comment on column public.wz_welkomstcalls.samenvatting is
  'Korte samenvatting van het gesprek, met de hand geschreven bij "Gesprek samenvatten". Ook te gebruiken als er niet gebeld hoefde te worden.';

commit;
