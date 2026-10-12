-- ===========================================================================
--  Planyo koppelen + volledige bedragen: alleen nieuwe kolommen
--  Opdracht Angela, 12-10-2026 (OPDRACHT-PLANYO-EN-BEDRAGEN.md, stap 0)
-- ===========================================================================
--  Voegt alleen toe. Er wordt geen bestaande kolom gewijzigd of verwijderd en
--  geen enkele bestaande rij aangeraakt: alle nieuwe kolommen zijn leeg.
--
--  planyo_id            het reserveringsnummer in Planyo. Staat los van
--                       kanaal/kanaal_ref, omdat een boeking uit het dashboard
--                       (kanaal eigen/telefonisch/whatsapp) of van Booking.com
--                       ook een Planyo-nummer heeft. Hieraan herkent de
--                       Planyo-import een boeking die er al staat.
--  servicekosten        servicekosten die de gast betaalt (zit al in
--                       bedrag_totaal; hier alleen om te tonen).
--  arrangementen_tekst  de lijst arrangementen zoals het kanaal hem opgeeft.
--  bedrag_bron          wie de bedragen heeft ingevuld (bijv. 'smg-mail',
--                       'planyo'). Leeg = met de hand of nog niet ingevuld.
--                       Een import werkt bedragen alleen bij als hij ze zelf
--                       had gevuld.
--  niet_in_planyo       "toch opgeslagen terwijl Planyo het weigerde": rood
--                       label in het dashboard tot iemand het heeft nagelopen.
--
--  De enige aanpassing aan iets bestaands: de controle op bron_feed laat nu
--  ook 'planyo' toe. Alle bestaande waarden (smg, booking, oo, leeg) blijven
--  geldig.
-- ===========================================================================

begin;

alter table public.reserveringen
  add column if not exists planyo_id           text,
  add column if not exists servicekosten       numeric(10,2),
  add column if not exists arrangementen_tekst text,
  add column if not exists bedrag_bron         text,
  add column if not exists niet_in_planyo      boolean not null default false;

-- Eén Planyo-nummer hoort bij hoogstens één reservering.
create unique index if not exists reserveringen_planyo_id
  on public.reserveringen (planyo_id) where planyo_id is not null;

alter table public.reserveringen drop constraint if exists reserveringen_bron_feed_check;
alter table public.reserveringen add constraint reserveringen_bron_feed_check
  check (bron_feed in ('smg', 'booking', 'oo', 'planyo'));

commit;

-- ===========================================================================
--  CONTROLE - draai dit erna
-- ===========================================================================
--  Verwacht: 5 kolommen, en het aantal rijen gelijk aan de back-up (698 op
--  12-10-2026 17:45, plus wat er sindsdien is bijgekomen).
--
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'reserveringen'
--    and column_name in ('planyo_id','servicekosten','arrangementen_tekst','bedrag_bron','niet_in_planyo');
-- select count(*) from public.reserveringen;
-- ===========================================================================
