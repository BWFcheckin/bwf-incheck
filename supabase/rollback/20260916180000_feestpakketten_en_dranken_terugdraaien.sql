-- Terugdraaien van 20260916180000_feestpakketten_en_dranken.sql
--
-- Verwijdert uitsluitend de dertien regels die die migratie heeft toegevoegd,
-- herkend aan naam en categorie samen. Alles wat er al stond blijft staan:
-- er wordt niet op categorie alleen verwijderd, want 'Arrangement' en 'Drank'
-- bevatten ook regels van voor deze migratie.
--
-- Let op: heeft er al een reservering gebruikgemaakt van een van deze regels,
-- dan blijft die reservering gewoon kloppen. De gekozen extra's worden bij het
-- opslaan als tekst en bedrag in reserveringen.arrangementen vastgelegd, dus
-- die gegevens hangen niet aan deze rijen.

begin;

delete from wz_extras
where (categorie, naam) in (
  ('Arrangement', 'Kids Poolparty t/m 11 jaar'),
  ('Arrangement', 'Kids Poolparty 12+ of gemengd'),
  ('Arrangement', 'Bridal- of Babyshower'),
  ('Feest', 'Thema versiering'),
  ('Feest', 'Ballonnenboog'),
  ('Feest', 'Gepersonaliseerde taart'),
  ('Feest', 'Gepersonaliseerde cupcakes'),
  ('Feest', 'Fotomoment met fotoboek'),
  ('Feest', 'Sweettable'),
  ('Feest', 'Extra uur'),
  ('Feest', 'Luxe sushi schaal (meerprijs)'),
  ('Drank', 'Zoete wijn'),
  ('Drank', 'Bier per fles')
);

commit;
