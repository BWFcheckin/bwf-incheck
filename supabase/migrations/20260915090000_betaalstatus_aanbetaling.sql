-- Betaalstatus 'aanbetaling' toevoegen (keuze Angela, 15-09-2026)
--
-- De kolom reserveringen.betaalstatus staat op dit moment drie waarden toe.
-- Zoals aangemaakt in 20260911120000_fase1_structuur.sql, regel 110:
--
--   betaalstatus text not null default 'open'
--     check (betaalstatus in ('open', 'deels', 'betaald'))
--
-- Angela wil op de reserveringskaart kunnen vastleggen dat een gast een
-- aanbetaling heeft gedaan, met het betaalde bedrag erbij. Een vierde waarde
-- wordt nu door de database geweigerd: het opslaan zou stilweg mislukken.
--
-- VERANDERT ALLEEN DE TOEGESTANE WAARDEN.
-- Geen bestaande rij verandert. 'open', 'deels' en 'betaald' blijven geldig en
-- houden hun betekenis; de standaardwaarde blijft 'open'. Er wordt geen kolom
-- toegevoegd of verwijderd, en geen recht of trigger aangepast. De trigger uit
-- 20260913120000_locatiemanager_beperkt_bewerken.sql bewaart betaalstatus
-- alleen (new.betaalstatus := old.betaalstatus) en controleert de waarde niet,
-- dus die blijft werken zoals hij nu werkt.
--
-- Pagina's die de nieuwe waarde nog niet kennen, blijven werken: zij tonen de
-- waarde dan als onbekende tekst, maar slaan niets stuk.
--
-- Terugdraaien:
--   supabase/rollback/20260915090000_betaalstatus_aanbetaling_terugdraaien.sql
-- Let op bij terugdraaien: reserveringen die dan op 'aanbetaling' staan moeten
-- eerst naar 'deels', anders weigert de oude beperking. Het terugdraaiscript
-- doet dat zelf.
--
-- Uitvoeren met:
--   supabase db query --linked -f supabase/migrations/20260915090000_betaalstatus_aanbetaling.sql

begin;

alter table public.reserveringen
  drop constraint if exists reserveringen_betaalstatus_check;

alter table public.reserveringen
  add constraint reserveringen_betaalstatus_check
  check (betaalstatus in ('open', 'deels', 'aanbetaling', 'betaald'));

commit;
