-- Idempotent household rename. Household comes from auth.uid() membership.
-- Join code is display-only: authenticated UPDATE on households is removed.

drop policy if exists households_update on public.households;

create table public.household_operations (
  operation_id uuid primary key,
  household_id uuid not null references public.households (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  operation_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint household_operations_type_valid check (
    operation_type in ('RENAME_HOUSEHOLD')
  )
);

alter table public.household_operations enable row level security;

create policy household_operations_select
  on public.household_operations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = household_operations.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create or replace function public.apply_household_command(
  p_operation_id uuid,
  p_operation_type text,
  p_payload jsonb,
  p_client_created_at timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  existing public.household_operations%rowtype;
  entity_name text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;

  select hm.household_id into hid
  from public.household_members hm
  where hm.user_id = uid;

  if hid is null then
    return jsonb_build_object('ok', false, 'code', 'no_household');
  end if;

  if p_operation_id is null
     or p_operation_type is null
     or p_payload is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_operation');
  end if;

  perform pg_advisory_xact_lock(
    ('x' || substr(replace(p_operation_id::text, '-', ''), 1, 16))::bit(64)::bigint
  );

  select * into existing
  from public.household_operations ho
  where ho.operation_id = p_operation_id;

  if found then
    if existing.household_id is not distinct from hid
       and existing.operation_type is not distinct from p_operation_type
       and existing.payload is not distinct from p_payload then
      return jsonb_build_object(
        'ok', true,
        'status', 'already_applied',
        'operation_id', p_operation_id
      );
    end if;
    return jsonb_build_object('ok', false, 'code', 'conflict');
  end if;

  if p_operation_type is distinct from 'RENAME_HOUSEHOLD' then
    return jsonb_build_object('ok', false, 'code', 'invalid_operation');
  end if;

  entity_name := btrim(p_payload ->> 'name');
  if entity_name is null or entity_name = '' or char_length(entity_name) > 80 then
    return jsonb_build_object('ok', false, 'code', 'invalid_name');
  end if;

  update public.households
  set name = entity_name, updated_at = now()
  where id = hid;

  insert into public.household_operations (
    operation_id,
    household_id,
    user_id,
    operation_type,
    payload
  ) values (
    p_operation_id,
    hid,
    uid,
    p_operation_type,
    p_payload
  );

  return jsonb_build_object('ok', true, 'status', 'applied', 'operation_id', p_operation_id);
end;
$$;

revoke all on function public.apply_household_command(uuid, text, jsonb, timestamp with time zone) from public, anon;
grant execute on function public.apply_household_command(uuid, text, jsonb, timestamp with time zone) to authenticated;
