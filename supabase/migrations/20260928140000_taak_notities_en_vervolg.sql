-- Notities bij een taak, en een vervolgtaak
-- ---------------------------------------------------------------------------
-- Angela, 28-09-2026: "ik wil ook notities kunnen toevoegen aan een taak, of
-- een vervolg toevoegen, of hem toewijzen."
--
-- Toewijzen kan al: dat is de bestaande kolom medewerker_id. De andere twee
-- niet, dus die komen erbij.
--
-- WAT ER GEBEURT
--   * wz_taken.notities   jsonb, standaard een lege lijst
--   * wz_taken.vervolg_van uuid, wijst naar de taak waar deze uit voortkomt
--
-- Er wordt niets verwijderd, niets hernoemd en geen bestaande rij aangeraakt.
--
-- WAAROM EEN JSONB-KOLOM EN GEEN APARTE TABEL
-- Een aparte tabel wz_taak_notities zou netter lijken, maar die erft geen
-- rechten. Dan moeten alle policies van wz_taken daar herhaald worden, en dat
-- is in dit project al een keer misgegaan: 20260916190000 haalde de enige
-- permissive policy weg en liet alleen restrictive regels staan, waarna
-- niemand nog een taak kon opslaan (hersteld in 20260921120000). Met een
-- kolom op wz_taken zelf gelden de bestaande regels ongewijzigd: wie de taak
-- mag zien ziet de notities, wie de taak mag wijzigen mag er een notitie bij
-- zetten. Geen tweede set rechten die uit de pas kan gaan lopen.
--
-- Het is ook het patroon dat er al ligt: reserveringen.arrangementen is
-- eveneens jsonb met wie-en-wanneer per regel.
--
-- HOE EEN NOTITIE ERUITZIET
--   [{"tekst":"Leverancier gebeld, komt dinsdag",
--     "door":"Gildo","op":"2026-09-28T14:03:00Z"}]
-- Nieuwste achteraan. Het scherm schrijft de hele lijst terug, dus een
-- notitie verdwijnt niet als er ondertussen een andere bij kwam - het scherm
-- haalt de taak eerst opnieuw op.
--
-- LET OP, EEN BEPERKING DIE BLIJFT
-- De bestaande regel voor wijzigen zegt: eigenaar en vr mogen alles, een
-- locatiemanager alleen taken die op zijn naam staan of die hij zelf heeft
-- aangemaakt. Een notitie zetten bij de taak van een ander kan dus niet. Dat
-- verandert deze migratie niet. Wil je dat wel, zeg het dan - dan is dat een
-- aparte, bewuste wijziging aan de rechten.

begin;

alter table public.wz_taken
  add column if not exists notities jsonb not null default '[]'::jsonb;

alter table public.wz_taken
  add column if not exists vervolg_van uuid;

-- De verwijzing naar de vorige taak. on delete set null: wordt de oude taak
-- ooit verwijderd, dan blijft de vervolgtaak gewoon bestaan en raakt alleen
-- het pijltje terug kwijt.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wz_taken_vervolg_van_fkey'
  ) then
    alter table public.wz_taken
      add constraint wz_taken_vervolg_van_fkey
      foreign key (vervolg_van) references public.wz_taken(id) on delete set null;
  end if;
end $$;

-- Zonder deze index moet de database bij "welke taken komen uit deze voort?"
-- alle rijen langs. Het zijn er nu 54, dus dat merk je niet, maar het kost
-- niets om het meteen goed te zetten.
create index if not exists wz_taken_vervolg_van_idx
  on public.wz_taken (vervolg_van) where vervolg_van is not null;

-- Alleen een lijst toestaan, geen los object of getal. Zo kan het scherm er
-- altijd overheen lopen zonder eerst te moeten controleren wat het is.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wz_taken_notities_check'
  ) then
    alter table public.wz_taken
      add constraint wz_taken_notities_check
      check (jsonb_typeof(notities) = 'array');
  end if;
end $$;

comment on column public.wz_taken.notities is
  'Aantekeningen bij de taak, nieuwste achteraan: [{tekst, door, op}]. '
  'Erft de rechten van wz_taken.';
comment on column public.wz_taken.vervolg_van is
  'De taak waar deze uit voortkomt, als hij als vervolg is aangemaakt.';

commit;

-- ===========================================================================
--  CONTROLE - draai dit erna
-- ===========================================================================
--  Er horen twee regels uit te komen: notities (jsonb, not null, default [])
--  en vervolg_van (uuid, nullable).

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'wz_taken'
  and column_name in ('notities', 'vervolg_van')
order by column_name;

--  En dit hoort 54 te zeggen, of hoeveel taken je er inmiddels hebt - alle
--  bestaande rijen krijgen een lege lijst, geen enkele blijft leeg staan.

select count(*) as met_lege_lijst from public.wz_taken where notities = '[]'::jsonb;

-- ===========================================================================
--  TERUGDRAAIEN
-- ===========================================================================
--  Zie rollback/20260928140000_taak_notities_en_vervolg_terug.sql
