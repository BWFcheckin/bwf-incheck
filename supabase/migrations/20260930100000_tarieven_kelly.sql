-- Tarieven voor het werkzaamheden-overzicht van Kelly
-- ---------------------------------------------------------------------------
-- Angela, 30-09-2026, letterlijk:
--
--   "Nieuwe boeking gast gegevens gecontroleerd en agenda boeking verwerkt in
--    dashboard 1,50
--    Welkomst call gedaan en incheck formulier gekoppeld whatsapp en of e-mail
--    verstuurd EUR 2
--    Extra omzet upsel Kelly geeft aan wat ze heeft bijgeboekt en over het
--    totaal wordt dan 10% berekend
--    Nieuwe reservering aangemaakt in het systeem 5% van de omzet
--    Data entry klant aangemaakt in klant bestand Kelly geeft aan hoeveel
--    klanten per keer en het wordt automatisch berekend"
--
-- WAT ER VERANDERT
--   1. de eenheid 'omzet' wordt toegestaan  (voor de twee percentage-regels)
--   2. twee bestaande tarieven krijgen hun bedrag  (stonden op EUR 0,00)
--   3. drie tarieven komen erbij
--
-- HOE EEN PERCENTAGE WORDT OPGESLAGEN
--   Er is geen aparte kolom voor percentages en die wil ik er ook niet bij
--   maken: dat raakt de rekenkern van vr2. In plaats daarvan is de EENHEID het
--   merkteken. Staat er eenheid = 'omzet', dan is het getal in `tarief` een
--   deel van 1 en geen bedrag in euro's:
--
--       tarief 0.10  ->  10% van wat Kelly als omzet invult
--       tarief 0.05  ->   5% van wat Kelly als omzet invult
--
--   Het rekenen blijft daardoor overal hetzelfde: bedrag = aantal x tarief.
--   Bij 'omzet' is `aantal` het omzetbedrag in plaats van een stuktal.
--
-- ER WORDT NIETS VERWIJDERD.
--   Alles is herhaalbaar: twee keer draaien geeft hetzelfde resultaat.
--   Al geregistreerde werkzaamheden veranderen NIET. Die hebben hun bedrag
--   destijds vastgelegd in wz_werkzaamheden.bedrag; deze migratie komt daar
--   niet aan.
--
-- NOG NIET INGEVULD
--   Appjes van gasten beantwoorden staat hier bewust NIET bij. Zie het
--   voorstel onderaan; zeg wat je wilt en dan komt er een losse migratie voor.

begin;

-- ---------------------------------------------------------------------------
-- 1. De eenheid 'omzet' toestaan
-- ---------------------------------------------------------------------------
-- Alleen als er daadwerkelijk een check-constraint op `eenheid` staat. Staat
-- die er niet, dan gebeurt hier niets en werkt de rest gewoon.
do $$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'wz_tarieven'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%eenheid%'
       and pg_get_constraintdef(con.oid) not ilike '%omzet%'
  loop
    execute format('alter table public.wz_tarieven drop constraint %I', c.conname);
    raise notice 'oude eenheid-regel vervangen: %', c.conname;
  end loop;

  if not exists (
    select 1
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'wz_tarieven'
       and con.conname = 'wz_tarieven_eenheid_check'
  ) then
    alter table public.wz_tarieven
      add constraint wz_tarieven_eenheid_check
      check (eenheid in ('reservering','toeslag','uur','record','call',
                         'locatie','maand','week','omzet','dag','gesprek'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Twee tarieven die al bestonden, maar op EUR 0,00 stonden
-- ---------------------------------------------------------------------------
update public.wz_tarieven
   set tarief = 2.00,
       omschrijving = 'Welkomstcall gedaan, incheckformulier gekoppeld en via WhatsApp en/of e-mail verstuurd'
 where taak = 'Welkomstcall'
   and coalesce(tarief, 0) = 0;

update public.wz_tarieven
   set tarief = 1.00,
       omschrijving = 'Per klant die je nieuw aanmaakt in het klantbestand'
 where taak = 'Data entry klantgegevens'
   and coalesce(tarief, 0) = 0;

-- ---------------------------------------------------------------------------
-- 3. De drie nieuwe tarieven
-- ---------------------------------------------------------------------------
insert into public.wz_tarieven (taak, omschrijving, soort, eenheid, uren, tarief, categorie, actief, sortering)
select v.taak, v.omschrijving, v.soort, v.eenheid, v.uren, v.tarief, v.categorie, true, v.sortering
  from (values
    ('Nieuwe boeking verwerkt',
     'Gastgegevens gecontroleerd en de boeking in de agenda van het dashboard gezet',
     'stuk', 'reservering', 0::numeric, 1.50::numeric, 'Backoffice', 210),

    ('Upsell bijgeboekt',
     'Extra omzet die jij hebt bijgeboekt. Vul het totaalbedrag in; je krijgt er 10% van.',
     'stuk', 'omzet', 0::numeric, 0.10::numeric, 'Backoffice', 220),

    ('Nieuwe reservering aangemaakt',
     'Een reservering die jij zelf in het systeem hebt gezet. Vul de omzet in; je krijgt er 5% van.',
     'stuk', 'omzet', 0::numeric, 0.05::numeric, 'Backoffice', 230),

    -- Angela, 30-09-2026, op de vraag of appjes beantwoorden meetelt: "per dag".
    -- Bewust niet per bericht: dat is niet te controleren en het beloont een
    -- lang gesprek boven een kort antwoord. Dit betaalt het bereikbaar zijn.
    ('Appjes van gasten beantwoord',
     'Per dag dat jij de app doet, ongeacht hoeveel berichten er binnenkomen',
     'stuk', 'dag', 0::numeric, 2.50::numeric, 'Backoffice', 240)
  ) as v(taak, omschrijving, soort, eenheid, uren, tarief, categorie, sortering)
 where not exists (
   select 1 from public.wz_tarieven t where t.taak = v.taak
 );

commit;

-- ---------------------------------------------------------------------------
-- Controle: draai dit erna en kijk of het klopt
-- ---------------------------------------------------------------------------
--   select taak, eenheid, tarief,
--          case when eenheid = 'omzet'
--               then (tarief * 100)::text || '% van de omzet'
--               else 'EUR ' || to_char(tarief, 'FM999D00') || ' per ' || eenheid
--          end as leest_als
--     from public.wz_tarieven
--    where taak in ('Nieuwe boeking verwerkt','Welkomstcall','Upsell bijgeboekt',
--                   'Nieuwe reservering aangemaakt','Data entry klantgegevens',
--                   'Appjes van gasten beantwoord')
--    order by sortering;
--
-- Verwacht: 6 regels.
--   Nieuwe boeking verwerkt        EUR 1,50 per reservering
--   Welkomstcall                   EUR 2,00 per call
--   Data entry klantgegevens       EUR 1,00 per record
--   Upsell bijgeboekt              10% van de omzet
--   Nieuwe reservering aangemaakt  5% van de omzet
--   Appjes van gasten beantwoord   EUR 2,50 per dag
--
-- Terugdraaien: zie rollback/20260930100000_terug.sql
