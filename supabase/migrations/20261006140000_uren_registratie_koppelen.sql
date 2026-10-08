-- ===========================================================================
--  uren_registratie aan een account koppelen - stap 1 van 2
--  Angela, 06-10-2026
-- ===========================================================================
--  WAT IK VOND
--  De tabel uren_registratie (34 regels, de urenstaat van Ruth) heeft RLS aan,
--  maar de vier regels eronder zeggen alle vier hetzelfde:
--
--    SELECT {authenticated} using true
--    INSERT {authenticated} check true
--    UPDATE {authenticated} using true check true
--    DELETE {authenticated} using true check true
--
--  Dus: iedereen die kan inloggen mag alle urenstaten lezen, wijzigen en
--  verwijderen. Zelfde situatie als psm_administratie vanochtend.
--
--  EN ER IS NOG IETS. De pagina uren-ruth.html logt in met een GEDEELD
--  account (uren@bedenwellnessflevoland.nl) en een toegangscode. Daarmee is
--  achteraf niet te zien wie iets heeft ingevuld of weggehaald - er staat
--  altijd hetzelfde account bij. Dat is precies wat deze migratie wil kunnen:
--  per persoon afschermen kan alleen als de database weet wie er typt.
--  Daarom gaat die pagina over op persoonlijke accounts, en in het dashboard
--  leent hij de inlog die er al is.
--
--  WAT DEZE STAP DOET
--  1. Kolom medewerker_id erbij (uuid naar wz_medewerkers).
--  2. Die vullen waar de naam exact overeenkomt. Let op: in de urenstaat staat
--     "Ruth Tilburg" en in wz_medewerkers kan "Ruth" staan. Daarom wordt er
--     ook op de voornaam gekeken, maar alleen als die precies één medewerker
--     oplevert - anders zou de urenstaat van de een bij de ander belanden.
--  3. Een index voor de beveiligingsregel van stap 2.
--
--  WAT DEZE STAP NIET DOET
--  De policies blijven ongemoeid. Na deze migratie kan iedereen dus nog
--  precies evenveel als nu: niets gaat kapot, niemand raakt iets kwijt.
--
--  Er wordt niets verwijderd. Twee keer draaien doet de tweede keer niets.
-- ===========================================================================

begin;

alter table public.uren_registratie
  add column if not exists medewerker_id uuid
    references public.wz_medewerkers(id) on delete set null;

comment on column public.uren_registratie.medewerker_id is
  'Het account waar deze urenregel bij hoort. Hierop bouwt de beveiligingsregel; '
  'de kolom medewerker blijft als leesbare naam staan.';

-- Eerst op de volledige naam.
update public.uren_registratie u
   set medewerker_id = m.id
  from public.wz_medewerkers m
 where u.medewerker_id is null
   and trim(lower(u.medewerker)) = trim(lower(m.naam));

-- Daarna op de voornaam, maar alleen waar die precies één medewerker oplevert.
-- "Ruth Tilburg" in de urenstaat tegenover "Ruth" in wz_medewerkers.
update public.uren_registratie u
   set medewerker_id = eenduidig.id
  from (
    -- min() bestaat niet voor uuid; array_agg wel. Omdat we alleen doorgaan
    -- waar aantal = 1 is, is het eerste element precies de enige. Angela
    -- liep op 08-10-2026 tegen "function min(uuid) does not exist" aan.
    select lower(split_part(trim(m.naam), ' ', 1)) as voornaam,
           (array_agg(m.id))[1]                    as id,
           count(*)                                as aantal
      from public.wz_medewerkers m
     where m.naam is not null and trim(m.naam) <> ''
     group by 1
  ) as eenduidig
 where u.medewerker_id is null
   and eenduidig.aantal = 1
   and lower(split_part(trim(u.medewerker), ' ', 1)) = eenduidig.voornaam;

create index if not exists uren_registratie_medewerker_id_idx
  on public.uren_registratie (medewerker_id, datum);

commit;

-- ===========================================================================
--  CONTROLE - draai dit erna en stuur me de uitkomst
-- ===========================================================================
--  Bij elke naam hoort "zonder_account = 0" te staan. Staat er een getal
--  groter dan nul, dan mag stap 2 NOG NIET: die regels zouden voor de
--  medewerker zelf onzichtbaar worden.

select u.medewerker                                        as naam_in_urenstaat,
       count(*)                                            as regels,
       count(*) filter (where u.medewerker_id is null)      as zonder_account,
       min(m.naam)                                         as naam_in_wz_medewerkers
  from public.uren_registratie u
  left join public.wz_medewerkers m on m.id = u.medewerker_id
 group by u.medewerker
 order by u.medewerker;

-- ===========================================================================
--  TERUGDRAAIEN
-- ===========================================================================
--  update public.uren_registratie set medewerker_id = null returning id;
--
--  Pas als je zeker weet dat je de kolom niet meer wilt:
--  drop index if exists public.uren_registratie_medewerker_id_idx;
--  alter table public.uren_registratie drop column medewerker_id;
-- ===========================================================================
