-- Terugdraaien van 20260930100000_tarieven_kelly.sql
-- ---------------------------------------------------------------------------
-- Dit zet de drie nieuwe tarieven op NIET-ACTIEF en de twee bijgewerkte
-- tarieven terug op EUR 0,00. Er wordt niets verwijderd: een tarief waar al
-- werkzaamheden aan hangen moet blijven bestaan, anders raken die regels hun
-- herkomst kwijt.

begin;

update public.wz_tarieven
   set actief = false
 where taak in ('Nieuwe boeking verwerkt',
                'Upsell bijgeboekt',
                'Nieuwe reservering aangemaakt',
                'Appjes van gasten beantwoord');

update public.wz_tarieven
   set tarief = 0
 where taak in ('Welkomstcall', 'Data entry klantgegevens');

commit;

-- De eenheid-regel laten we staan zoals hij is: hij is ruimer dan eerst en
-- houdt niets tegen wat ooit werkte. Hem terugzetten zou juist een regel
-- kunnen weigeren die inmiddels is opgeslagen.
