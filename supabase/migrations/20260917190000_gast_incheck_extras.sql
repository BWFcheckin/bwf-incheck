-- gast-incheck-setup.sql
-- Eén keer uitvoeren in Supabase (SQL Editor) voor project iuyjvtlauktnjprbmbjj.
-- 1) extra kolommen op gast_aanmeldingen voor de calculator
-- 2) trigger die automatisch een taak in wz_taken aanmaakt bij de reservering

-- 1. Kolommen -------------------------------------------------------------
alter table public.gast_aanmeldingen
  add column if not exists extras        jsonb,
  add column if not exists extras_totaal numeric(10,2) default 0,
  add column if not exists betaalwijze   text,
  add column if not exists opmerking     text;

-- 2. Taak aanmaken in het dashboard (wz_taken) -----------------------------
create or replace function public.gast_extras_naar_taak()
returns trigger
language plpgsql
security definer          -- draait met rechten van de eigenaar, de gast schrijft dus nooit zelf in wz_taken
set search_path = public
as $$
declare
  suite_naam text;
  regels     text := '';
  r          jsonb;
  betaal     text;
begin
  -- alleen als er extra's gekozen zijn
  if new.extras is null or jsonb_array_length(new.extras) = 0 then
    return new;
  end if;

  suite_naam := case new.locatie
                  when 'angie'   then 'Suite Angie Almere'
                  when 'jacuzzi' then 'Malina Jacuzzi'
                  when 'deluxe'  then 'Malina Zwembad Deluxe'
                  else coalesce(new.locatie, '')
                end;

  for r in select * from jsonb_array_elements(new.extras) loop
    regels := regels || format('%s× %s — €%s' || chr(10),
                 r->>'aantal', r->>'naam', to_char((r->>'subtotaal')::numeric, 'FM999990.00'));
  end loop;

  betaal := case new.betaalwijze
              when 'ideal_locatie' then 'iDeal QR op locatie'
              when 'contant'       then 'contant op locatie'
              when 'betaallink'    then 'BETAALLINK STUREN'
              else coalesce(new.betaalwijze, '')
            end;

  insert into public.wz_taken (titel, omschrijving, deadline, prioriteit, status, bron, link)
  values (
    format('Extra''s klaarzetten — %s %s', new.voornaam, new.achternaam),
    concat_ws(chr(10),
      concat_ws(' · ', suite_naam,
                to_char(new.datum::date, 'DD-MM-YYYY'),
                case when new.code is not null then 'res. ' || new.code end,
                case when new.telefoon is not null then 'tel. ' || new.telefoon end),
      '',
      regels,
      'Totaal extra''s: €' || to_char(coalesce(new.extras_totaal,0), 'FM999990.00'),
      'Betaling: ' || betaal,
      case when new.opmerking is not null then 'Opmerking gast: ' || new.opmerking end
    ),
    (new.datum::date - interval '1 day')::date,   -- extra's zijn tot 24 uur vóór bij te boeken
    'hoog',
    'open',
    'gastincheck',
    'https://bwfcheckin.github.io/bwf-incheck/vr2.html'
  );
  return new;
end;
$$;

drop trigger if exists trg_gast_extras_naar_taak on public.gast_aanmeldingen;
create trigger trg_gast_extras_naar_taak
  after insert on public.gast_aanmeldingen
  for each row execute function public.gast_extras_naar_taak();

-- Controle: bestaat de kolom 'bron' en 'link' in wz_taken? (vr2.html gebruikt ze al)
-- Zo niet:
-- alter table public.wz_taken add column if not exists bron text, add column if not exists link text;

-- 3. Catalogus die je beheert in gast-incheck-beheer.html -----------------
create table if not exists public.gast_catalogus (
  id          text primary key,      -- 'standaard'
  data        jsonb not null,        -- lijst die gasten zien (zonder verborgen items)
  beheer      jsonb,                 -- volledige lijst incl. verborgen items (voor het beheerscherm)
  bijgewerkt  timestamptz default now()
);
alter table public.gast_catalogus enable row level security;
-- gasten (anon) mogen alleen lezen; schrijven gebeurt met de service_role-sleutel vanuit het beheerscherm
drop policy if exists "catalogus lezen" on public.gast_catalogus;
create policy "catalogus lezen" on public.gast_catalogus for select to anon, authenticated using (true);
