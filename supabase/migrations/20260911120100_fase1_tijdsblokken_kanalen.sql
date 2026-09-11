-- Fase 1 · migratie 2/4 — tijdsblokken (exact SMG) en kanaalinstellingen
-- Alleen toevoegen; bestaande rijen worden overgeslagen (on conflict do nothing).
-- De ICS-links staan als Supabase-secrets; hier alleen de namen van die secrets.
begin;

-- Eén rij per unieke tijd per suite. Arrangementen met dezelfde tijden delen één blok.
-- overnachting = er wordt geslapen (nachtregister/toeristenbelasting); volgende_dag wordt berekend (eind <= begin).
insert into public.tijdsblokken (suite, type, naam, begin, eind, overnachting, smg_room_id, sortering) values
  -- angie (SMG room 459)
  ('angie', 'dagverblijf',  'Dagverblijf 12:00–15:00',   '12:00', '15:00', false, 459, 10),
  ('angie', 'dagverblijf',  'Dagverblijf 12:00–16:00',   '12:00', '16:00', false, 459, 11),
  ('angie', 'dagverblijf',  'Dagverblijf 12:30–16:30',   '12:30', '16:30', false, 459, 12),
  ('angie', 'dagverblijf',  'Dagverblijf 13:00–16:00',   '13:00', '16:00', false, 459, 13),
  ('angie', 'dagverblijf',  'Dagverblijf 13:00–17:00',   '13:00', '17:00', false, 459, 14),
  ('angie', 'dagverblijf',  'Dagverblijf 13:00–18:00',   '13:00', '18:00', false, 459, 15),
  ('angie', 'overnachting', 'Overnachting 13:00–11:00',  '13:00', '11:00', true,  459, 20),
  ('angie', 'late_checkin', 'Late check-in 20:00–11:00', '20:00', '11:00', true,  459, 30),
  ('angie', 'honeymoon',    'Honeymoon 01:00–15:00',     '01:00', '15:00', true,  459, 40),
  -- malina_deluxe (SMG room 907)
  ('malina_deluxe', 'dagverblijf',  'Dagverblijf 12:30–15:30',   '12:30', '15:30', false, 907, 10),
  ('malina_deluxe', 'dagverblijf',  'Dagverblijf 12:30–16:30',   '12:30', '16:30', false, 907, 11),
  ('malina_deluxe', 'dagverblijf',  'Dagverblijf 13:00–16:00',   '13:00', '16:00', false, 907, 12),
  ('malina_deluxe', 'dagverblijf',  'Dagverblijf 13:00–17:00',   '13:00', '17:00', false, 907, 13),
  ('malina_deluxe', 'overnachting', 'Overnachting 13:00–11:00',  '13:00', '11:00', true,  907, 20),
  ('malina_deluxe', 'late_checkin', 'Late check-in 19:00–11:00', '19:00', '11:00', true,  907, 30),
  ('malina_deluxe', 'honeymoon',    'Honeymoon 01:00–15:00',     '01:00', '15:00', true,  907, 40),
  -- malina_jacuzzi (SMG room 802) — enige overnachting is 20:00–10:00
  ('malina_jacuzzi', 'dagverblijf',  'Dagverblijf 12:00–14:30',  '12:00', '14:30', false, 802, 10),
  ('malina_jacuzzi', 'dagverblijf',  'Dagverblijf 12:00–16:00',  '12:00', '16:00', false, 802, 11),
  ('malina_jacuzzi', 'dagverblijf',  'Dagverblijf 15:00–18:00',  '15:00', '18:00', false, 802, 12),
  ('malina_jacuzzi', 'avond',        'Avond 20:00–23:00',        '20:00', '23:00', false, 802, 20),
  ('malina_jacuzzi', 'overnachting', 'Overnachting 20:00–10:00', '20:00', '10:00', true,  802, 30)
on conflict (suite, begin, eind) do nothing;

-- Kanalen per suite: extern_id = SMG room-ID / Booking.com hotel-ID / OO-snelcode
insert into public.kanaal_instellingen (kanaal, suite, extern_id, ics_secret, uitbetaalregel) values
  ('smg',     'angie',          '459',      'ICS_ANGIE_SMG',              'dag7_volgende_maand'),
  ('booking', 'angie',          '12955821', 'ICS_ANGIE_BOOKING',          'na_aankomst'),
  ('oo',      'angie',          '2750',     'ICS_ANGIE_OO',               'direct'),
  ('smg',     'malina_deluxe',  '907',      'ICS_MALINA_DELUXE_SMG',      'dag7_volgende_maand'),
  ('booking', 'malina_deluxe',  '14967346', 'ICS_MALINA_DELUXE_BOOKING',  'na_aankomst'),
  ('oo',      'malina_deluxe',  '2900',     'ICS_MALINA_DELUXE_OO',       'direct'),
  ('smg',     'malina_jacuzzi', '802',      'ICS_MALINA_JACUZZI_SMG',     'dag7_volgende_maand'),
  ('booking', 'malina_jacuzzi', '16218254', 'ICS_MALINA_JACUZZI_BOOKING', 'na_aankomst'),
  ('oo',      'malina_jacuzzi', '2901',     'ICS_MALINA_JACUZZI_OO',      'direct')
on conflict (kanaal, suite) do nothing;

-- Controle
do $$
begin
  if (select count(*) from public.tijdsblokken) < 21 then
    raise exception 'Verwacht 21 tijdsblokken';
  end if;
  if (select count(*) from public.kanaal_instellingen) < 9 then
    raise exception 'Verwacht 9 kanaalinstellingen';
  end if;
end
$$;

commit;
