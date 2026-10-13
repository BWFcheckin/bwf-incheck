-- Terugdraaien van 20261013210000_gastberichten.sql
-- Verwijdert de tabel gast_berichten (met alle opgeslagen gastberichten) en de drie functies.
-- Aan de reserveringen zelf verandert niets: daar schreef deze koppeling nooit in.
begin;
drop function if exists public.gastbericht_afvinken(bigint, boolean);
drop function if exists public.gastberichten_verwerk(jsonb, boolean);
drop function if exists public.gastbericht_zoek_reservering(text, text, date, text);
drop table if exists public.gast_berichten;
commit;
