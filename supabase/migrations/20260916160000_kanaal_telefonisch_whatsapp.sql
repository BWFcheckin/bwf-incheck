-- VOORSTEL: telefonisch en whatsapp als kanaal toestaan (keuze Angela, 16-09-2026)
-- NOG NIET UITGEVOERD: eerst lezen, dan proefdraaien.
--
-- HOE HET NU STAAT (gecontroleerd op de gekoppelde omgeving):
--   reserveringen_kanaal_check:
--     CHECK (kanaal = ANY (ARRAY['smg','oo','booking','planyo','eigen','handmatig']))
--
-- Angela boekt ook telefonisch en via WhatsApp. Die twee worden nu allebei als
-- 'handmatig' weggeschreven, waardoor ze in overzichten niet uit elkaar te
-- houden zijn. De inventaris merkte dat al op: er is geen kanaalwaarde voor
-- telefonisch.
--
-- VERANDERT ALLEEN DE TOEGESTANE WAARDEN.
-- Geen bestaande rij verandert. De zes huidige waarden blijven geldig en
-- houden hun betekenis. Er wordt niets omgezet: boekingen die nu 'handmatig'
-- zijn blijven 'handmatig', ook als ze destijds telefonisch binnenkwamen.
-- Wie dat met terugwerkende kracht wil rechtzetten, moet dat bewust en apart
-- doen; dat raden wij niet aan zonder te weten welke boeking wat was.
--
-- Pagina's die de nieuwe waarden nog niet kennen blijven werken: zij tonen de
-- waarde dan als onbekende tekst, maar slaan niets stuk.
--
-- Terugdraaien:
--   supabase/rollback/20260916160000_kanaal_telefonisch_whatsapp_terugdraaien.sql
-- Let op bij terugdraaien: reserveringen die dan 'telefonisch' of 'whatsapp'
-- zijn moeten eerst naar 'handmatig', anders weigert de oude beperking. Het
-- terugdraaiscript doet dat zelf.
--
-- Uitvoeren met:
--   supabase db query --linked -f supabase/migrations/20260916160000_kanaal_telefonisch_whatsapp.sql

begin;

alter table public.reserveringen
  drop constraint if exists reserveringen_kanaal_check;

alter table public.reserveringen
  add constraint reserveringen_kanaal_check
  check (kanaal in ('smg', 'oo', 'booking', 'planyo', 'eigen', 'handmatig',
                    'telefonisch', 'whatsapp'));

commit;
