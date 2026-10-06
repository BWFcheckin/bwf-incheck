-- ===========================================================================
--  psm_administratie aan een account koppelen - stap 1 van 2
--  Angela, 06-10-2026
-- ===========================================================================
--  WAAROM
--  De tabel psm_administratie wordt nu beschermd door deze regel:
--
--    create policy "ingelogd lezen en schrijven" on public.psm_administratie
--      for all to authenticated using (true) with check (true);
--
--  `using (true)` betekent: iedereen die kan inloggen mag alles lezen en
--  wijzigen. Jerry, Ruth, Gildo en Kelly kunnen dus de administratie van
--  Michel inzien en aanpassen - zijn vergoedingen, zijn bank- en kasbedragen.
--  Angela wil dat alleen Michel en zij erbij kunnen.
--
--  HET PROBLEEM OM EERST OP TE LOSSEN
--  De tabel herkent een regel aan `medewerker`, een stukje tekst met een naam
--  erin ("Michel"). Een beveiligingsregel kan daar niet op bouwen: heet het
--  account in wz_medewerkers "Michel Oliveira" en staat er in de regel
--  "Michel", dan zou Michel buitengesloten worden van zijn eigen
--  administratie. Dat is precies het soort stille fout dat niet mag.
--
--  Daarom eerst een echte koppeling erbij, en pas daarna de regel aanscherpen.
--
--  WAT DEZE STAP DOET
--  1. Kolom medewerker_id erbij (uuid naar wz_medewerkers).
--  2. Die vullen waar de naam exact overeenkomt met een naam in
--     wz_medewerkers. Alleen waar er nog niets stond.
--  3. Een index, zodat de beveiligingsregel van stap 2 snel blijft.
--
--  WAT DEZE STAP NIET DOET
--  De policy blijft ongemoeid. Na deze migratie kan iedereen dus nog precies
--  evenveel als nu: niets gaat kapot, niemand raakt iets kwijt. Het
--  dichtzetten gebeurt in stap 2, en pas nadat de controle hieronder laat zien
--  dat alle regels een account hebben.
--
--  Er wordt niets verwijderd. Draai je dit twee keer, dan doet de tweede keer
--  niets.
-- ===========================================================================

begin;

alter table public.psm_administratie
  add column if not exists medewerker_id uuid
    references public.wz_medewerkers(id) on delete set null;

comment on column public.psm_administratie.medewerker_id is
  'Het account waar deze regel bij hoort. Hierop bouwt de beveiligingsregel; '
  'de kolom medewerker blijft als leesbare naam staan.';

-- De bestaande regels koppelen aan een account, op een naam die exact gelijk
-- is. Niet op "lijkt erop": een gedeeltelijke match zou de administratie van
-- de een aan de ander kunnen hangen, en dat is erger dan een regel die nog
-- even zonder account staat.
update public.psm_administratie a
   set medewerker_id = m.id
  from public.wz_medewerkers m
 where a.medewerker_id is null
   and trim(lower(a.medewerker)) = trim(lower(m.naam));

create index if not exists psm_administratie_medewerker_id_idx
  on public.psm_administratie (medewerker_id, datum);

commit;

-- ===========================================================================
--  CONTROLE - draai dit erna en stuur me de uitkomst
-- ===========================================================================
--  Hier hoort bij elke naam "zonder account = 0" te staan. Staat er een
--  getal groter dan nul, dan heet dat account in wz_medewerkers anders dan in
--  deze administratie. Stap 2 mag dan NOG NIET: die regels zouden voor de
--  eigenaar wel en voor de medewerker zelf niet meer zichtbaar zijn.

select a.medewerker                                        as naam_in_administratie,
       count(*)                                            as regels,
       count(*) filter (where a.medewerker_id is null)      as zonder_account,
       min(m.naam)                                         as naam_in_wz_medewerkers
  from public.psm_administratie a
  left join public.wz_medewerkers m on m.id = a.medewerker_id
 group by a.medewerker
 order by a.medewerker;

-- ===========================================================================
--  TERUGDRAAIEN
-- ===========================================================================
--  Eerst leegmaken, zodat er geen gegevens verdwijnen:
--    update public.psm_administratie set medewerker_id = null returning id;
--
--  Pas als je zeker weet dat je de kolom niet meer wilt:
--    drop index if exists public.psm_administratie_medewerker_id_idx;
--    alter table public.psm_administratie drop column medewerker_id;
-- ===========================================================================
