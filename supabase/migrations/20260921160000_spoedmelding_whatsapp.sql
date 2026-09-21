-- Spoedmelding per WhatsApp bij een boeking die binnen 24 uur aankomt
-- ---------------------------------------------------------------------------
-- Angela, 21-09-2026: "ik wil dat er een automatisch whatsapp wordt verstuurd
-- per locatie als er een spoedreservering binnen 24 uur wordt gedaan."
--
-- Deze migratie maakt ALLEEN de boekhouding: een tabel die bijhoudt welke
-- melding al de deur uit is. Zonder die tabel zou elke ronde van de taak
-- dezelfde boeking opnieuw versturen.
--
-- Er wordt hier bewust GEEN trigger op reserveringen gezet. De import van
-- Booking.com en Origineel Overnachten schrijft in één keer tientallen rijen;
-- een trigger per rij zou dan tientallen appjes tegelijk versturen en de
-- import laten wachten op een externe server. In plaats daarvan kijkt een
-- taak elke vijf minuten wat er nieuw is. Die taak staat in een aparte
-- migratie, zodat deze nu al kan draaien terwijl de WhatsApp-koppeling nog
-- ingesteld wordt.
--
-- Niets wordt verwijderd of gewijzigd aan bestaande tabellen.

begin;

create table if not exists public.meldingen_verstuurd (
  id              bigint generated always as identity primary key,
  reservering_id  uuid        not null references public.reserveringen(id) on delete cascade,
  soort           text        not null default 'spoed_whatsapp',
  locatie         text,
  nummer          text,                       -- naar welk nummer het ging
  gelukt          boolean     not null default false,
  antwoord        text,                       -- wat de WhatsApp-dienst teruggaf
  verstuurd_op    timestamptz not null default now()
);

-- Per reservering hoogstens één melding van een soort. Mislukt hij, dan wordt
-- de rij bijgewerkt en niet opnieuw ingevoegd, zodat een storing bij de
-- WhatsApp-dienst geen stapel dubbele berichten oplevert zodra hij het weer doet.
create unique index if not exists meldingen_verstuurd_uniek
  on public.meldingen_verstuurd (reservering_id, soort);

create index if not exists meldingen_verstuurd_datum
  on public.meldingen_verstuurd (verstuurd_op desc);

alter table public.meldingen_verstuurd enable row level security;

-- Lezen mag iedereen die is ingelogd: het dashboard laat zien of de melding
-- eruit is. Schrijven doet alleen de Edge Function met de service-rol, die
-- langs RLS gaat; daarom staat er bewust geen insert- of update-policy.
drop policy if exists meldingen_verstuurd_lezen on public.meldingen_verstuurd;
create policy meldingen_verstuurd_lezen
  on public.meldingen_verstuurd
  for select
  to authenticated
  using (true);

commit;

-- Terugdraaien (staat ook in rollback/20260921160000_terug.sql):
--   drop table if exists public.meldingen_verstuurd;
