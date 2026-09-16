-- Terugdraaien van 20260916200000_welkomstcall_samenvatting.sql
--
-- LET OP: dit verwijdert de kolom én alles wat erin geschreven is. Zijn er al
-- samenvattingen ingetypt, dan zijn die daarna weg. Exporteer ze eerst als je
-- ze wilt bewaren:
--
--   select id, naam, datum, samenvatting
--     from public.wz_welkomstcalls
--    where samenvatting is not null;
--
-- Wil je alleen dat de knop verdwijnt, draai dan de codewijziging terug en laat
-- deze kolom staan: een ongebruikte lege kolom doet geen kwaad.

begin;

alter table public.wz_welkomstcalls
  drop column if exists samenvatting;

commit;
