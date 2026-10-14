-- Gastenlink in Planyo (Angela, 14-10-2026)
-- De beveiligde gastenlink komt als eigenschap (fixed_gastenlink) bij de Planyo-reservering, zodat
-- sjabloon 1 en 2 hem kunnen gebruiken. kanalen-sync zet hem daar neer en onthoudt hier wanneer.
-- Een link moet ook werken als de boeking ver vooruit ligt: hij verloopt nu op zijn vroegst een
-- week na het vertrek (was: altijd 90 dagen na het maken).
begin;

alter table public.bwf_gastlink
  add column if not exists planyo_gezet_op timestamptz;

create or replace function public.bwf_gastlink_maak(p_reservering uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token  text;
  v_vertrek timestamptz;
begin
  if (select public.bwf_toegangsrol()) is null then
    raise exception 'Geen toegang.';
  end if;

  select r.vertrek into v_vertrek from public.reserveringen r where r.id = p_reservering;

  -- De nieuwste link die tot na het vertrek geldig is, hergebruiken.
  select token into v_token
    from public.bwf_gastlink
   where reservering_id = p_reservering
     and verloopt_op > now()
     and (v_vertrek is null or verloopt_op >= v_vertrek)
   order by aangemaakt_op desc
   limit 1;
  if v_token is not null then
    return v_token;
  end if;

  v_token := replace(pg_catalog.gen_random_uuid()::text, '-', '') ||
             replace(pg_catalog.gen_random_uuid()::text, '-', '');
  insert into public.bwf_gastlink (token, reservering_id, verloopt_op)
  values (v_token, p_reservering,
          greatest(now() + interval '90 days', coalesce(v_vertrek + interval '7 days', now())));
  return v_token;
end;
$$;

revoke execute on function public.bwf_gastlink_maak(uuid) from public, anon;
grant  execute on function public.bwf_gastlink_maak(uuid) to authenticated, service_role;

commit;
