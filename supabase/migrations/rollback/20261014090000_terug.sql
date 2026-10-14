-- Terugdraaien van 20261014090000_gastlink_naar_planyo.sql
-- De functie gaat terug naar de versie uit 20261003100000 (draai dat deel van die migratie opnieuw);
-- de kolom mag blijven staan, maar kan zo weg:
alter table public.bwf_gastlink drop column if exists planyo_gezet_op;
