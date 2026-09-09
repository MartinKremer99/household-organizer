-- Multi-lot inventory command. Client allocations only (no server FEFO).
-- inventory_operations.operation_id remains the logical idempotency key.
-- apply_inventory_delta becomes a one-lot wrapper without expiration_date.

create table public.inventory_operation_lots (
  operation_id uuid not null references public.inventory_operations (operation_id),
  household_id uuid not null,
  inventory_lot_id uuid not null,
  delta integer not null,
  primary key (operation_id, inventory_lot_id),
  constraint inventory_operation_lots_delta_nonzero check (delta <> 0),
  constraint inventory_operation_lots_household_lot_fkey
    foreign key (household_id, inventory_lot_id)
    references public.inventory_lots (household_id, id)
    on delete restrict
);

alter table public.inventory_operation_lots enable row level security;

create policy inventory_operation_lots_select
  on public.inventory_operation_lots
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = inventory_operation_lots.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy inventory_operation_lots_insert
  on public.inventory_operation_lots
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = inventory_operation_lots.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy inventory_operation_lots_update
  on public.inventory_operation_lots
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = inventory_operation_lots.household_id
        and hm.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = inventory_operation_lots.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy inventory_operation_lots_delete
  on public.inventory_operation_lots
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = inventory_operation_lots.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create or replace function public.apply_inventory_command(
  p_operation_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_operation_type text,
  p_allocations jsonb,
  p_client_created_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  location_household uuid;
  elem jsonb;
  lot_id uuid;
  line_delta integer;
  has_expiration boolean;
  exp_date date;
  lot_household uuid;
  lot_product uuid;
  lot_location uuid;
  lot_quantity integer;
  lot_expiration date;
  total_delta integer := 0;
  seen_ids uuid[] := '{}';
  create_ids uuid[] := '{}';
  create_exps date[] := '{}';
  parent_lot uuid;
  existing public.inventory_operations%rowtype;
  existing_lines jsonb;
  incoming_lines jsonb;
  updated integer;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'unauthorized');
  end if;

  if p_operation_id is null
     or p_operation_type is null
     or btrim(p_operation_type) = '' then
    return jsonb_build_object('ok', false, 'code', 'invalid_operation');
  end if;

  if p_operation_type not in ('ADD', 'REMOVE') then
    return jsonb_build_object('ok', false, 'code', 'invalid_operation');
  end if;

  if p_allocations is null or jsonb_typeof(p_allocations) is distinct from 'array'
     or jsonb_array_length(p_allocations) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_operation');
  end if;

  select p.household_id into hid
  from public.products p
  where p.id = p_product_id;

  if hid is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_product');
  end if;

  if not exists (
    select 1
    from public.household_members hm
    where hm.household_id = hid
      and hm.user_id = uid
  ) then
    return jsonb_build_object('ok', false, 'code', 'unauthorized');
  end if;

  if p_location_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_location');
  end if;

  select l.household_id into location_household
  from public.locations l
  where l.id = p_location_id;

  if location_household is null or location_household is distinct from hid then
    return jsonb_build_object('ok', false, 'code', 'invalid_location');
  end if;

  for elem in
    select value
    from jsonb_array_elements(p_allocations) as t(value)
    order by t.value ->> 'inventory_lot_id'
  loop
    if elem ->> 'inventory_lot_id' is null then
      return jsonb_build_object('ok', false, 'code', 'invalid_lot');
    end if;

    begin
      lot_id := (elem ->> 'inventory_lot_id')::uuid;
    exception
      when invalid_text_representation then
        return jsonb_build_object('ok', false, 'code', 'invalid_lot');
    end;

    if lot_id = any (seen_ids) then
      return jsonb_build_object('ok', false, 'code', 'invalid_operation');
    end if;
    seen_ids := seen_ids || lot_id;

    if jsonb_typeof(elem -> 'delta') is distinct from 'number' then
      return jsonb_build_object('ok', false, 'code', 'invalid_quantity');
    end if;

    if (elem ->> 'delta')::numeric != trunc((elem ->> 'delta')::numeric) then
      return jsonb_build_object('ok', false, 'code', 'invalid_quantity');
    end if;

    line_delta := (elem ->> 'delta')::integer;
    if line_delta = 0 then
      return jsonb_build_object('ok', false, 'code', 'invalid_quantity');
    end if;

    if p_operation_type = 'ADD' and line_delta < 0 then
      return jsonb_build_object('ok', false, 'code', 'invalid_operation');
    end if;

    if p_operation_type = 'REMOVE' and line_delta > 0 then
      return jsonb_build_object('ok', false, 'code', 'invalid_operation');
    end if;

    has_expiration := elem ? 'expiration_date';
    if has_expiration then
      if elem -> 'expiration_date' = 'null'::jsonb then
        exp_date := null;
      else
        if (elem ->> 'expiration_date') !~ '^\d{4}-\d{2}-\d{2}$' then
          return jsonb_build_object('ok', false, 'code', 'invalid_lot');
        end if;
        begin
          exp_date := (elem ->> 'expiration_date')::date;
        exception
          when others then
            return jsonb_build_object('ok', false, 'code', 'invalid_lot');
        end;
      end if;
    end if;

    total_delta := total_delta + line_delta;
  end loop;

  if total_delta = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_quantity');
  end if;

  perform pg_advisory_xact_lock(
    ('x' || substr(replace(p_operation_id::text, '-', ''), 1, 16))::bit(64)::bigint
  );

  incoming_lines := (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'inventory_lot_id', (t.value ->> 'inventory_lot_id')::uuid,
          'delta', (t.value ->> 'delta')::integer
        )
        order by (t.value ->> 'inventory_lot_id')::uuid
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements(p_allocations) as t(value)
  );

  select * into existing
  from public.inventory_operations io
  where io.operation_id = p_operation_id;

  if found then
    existing_lines := (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'inventory_lot_id', iol.inventory_lot_id,
            'delta', iol.delta
          )
          order by iol.inventory_lot_id
        ),
        '[]'::jsonb
      )
      from public.inventory_operation_lots iol
      where iol.operation_id = p_operation_id
    );

    if existing.product_id is not distinct from p_product_id
       and existing.location_id is not distinct from p_location_id
       and existing.operation_type is not distinct from p_operation_type
       and existing.delta is not distinct from total_delta
       and existing_lines = incoming_lines then
      return jsonb_build_object(
        'ok', true,
        'status', 'already_applied',
        'operation_id', p_operation_id
      );
    end if;

    return jsonb_build_object('ok', false, 'code', 'conflict');
  end if;

  for elem in
    select value
    from jsonb_array_elements(p_allocations) as t(value)
    order by (t.value ->> 'inventory_lot_id')::uuid
  loop
    lot_id := (elem ->> 'inventory_lot_id')::uuid;
    line_delta := (elem ->> 'delta')::integer;
    has_expiration := elem ? 'expiration_date';
    if has_expiration then
      if elem -> 'expiration_date' = 'null'::jsonb then
        exp_date := null;
      else
        exp_date := (elem ->> 'expiration_date')::date;
      end if;
    end if;

    select lot.household_id, lot.product_id, lot.location_id, lot.quantity, lot.expiration_date
    into lot_household, lot_product, lot_location, lot_quantity, lot_expiration
    from public.inventory_lots lot
    where lot.id = lot_id
    for update;

    if found then
      if lot_household is distinct from hid
         or lot_product is distinct from p_product_id
         or lot_location is distinct from p_location_id then
        return jsonb_build_object('ok', false, 'code', 'invalid_lot');
      end if;

      if has_expiration and lot_expiration is distinct from exp_date then
        return jsonb_build_object('ok', false, 'code', 'invalid_lot');
      end if;

      if lot_quantity + line_delta < 0 then
        return jsonb_build_object('ok', false, 'code', 'insufficient_stock');
      end if;
    else
      if p_operation_type = 'ADD' and has_expiration then
        create_ids := array_append(create_ids, lot_id);
        create_exps := array_append(create_exps, exp_date);
      else
        return jsonb_build_object('ok', false, 'code', 'invalid_lot');
      end if;
    end if;
  end loop;

  if jsonb_array_length(p_allocations) = 1 then
    parent_lot := (p_allocations -> 0 ->> 'inventory_lot_id')::uuid;
  else
    parent_lot := null;
  end if;

  if array_length(create_ids, 1) is not null then
    for i in 1 .. array_length(create_ids, 1) loop
      begin
        insert into public.inventory_lots (
          id,
          household_id,
          product_id,
          location_id,
          quantity,
          expiration_date
        ) values (
          create_ids[i],
          hid,
          p_product_id,
          p_location_id,
          0,
          create_exps[i]
        );
      exception
        when unique_violation then
          raise exception 'invalid_lot' using errcode = 'P0001';
      end;
    end loop;
  end if;

  begin
    insert into public.inventory_operations (
      id,
      operation_id,
      household_id,
      user_id,
      product_id,
      location_id,
      inventory_lot_id,
      delta,
      operation_type,
      client_created_at
    ) values (
      p_operation_id,
      p_operation_id,
      hid,
      uid,
      p_product_id,
      p_location_id,
      parent_lot,
      total_delta,
      p_operation_type,
      p_client_created_at
    );
  exception
    when unique_violation then
      if array_length(create_ids, 1) is not null then
        raise;
      end if;

      select * into existing
      from public.inventory_operations io
      where io.operation_id = p_operation_id;

      existing_lines := (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'inventory_lot_id', iol.inventory_lot_id,
              'delta', iol.delta
            )
            order by iol.inventory_lot_id
          ),
          '[]'::jsonb
        )
        from public.inventory_operation_lots iol
        where iol.operation_id = p_operation_id
      );

      if existing.product_id is not distinct from p_product_id
         and existing.location_id is not distinct from p_location_id
         and existing.operation_type is not distinct from p_operation_type
         and existing.delta is not distinct from total_delta
         and existing_lines = incoming_lines then
        return jsonb_build_object(
          'ok', true,
          'status', 'already_applied',
          'operation_id', p_operation_id
        );
      end if;

      return jsonb_build_object('ok', false, 'code', 'conflict');
  end;

  insert into public.inventory_operation_lots (
    operation_id,
    household_id,
    inventory_lot_id,
    delta
  )
  select
    p_operation_id,
    hid,
    (t.value ->> 'inventory_lot_id')::uuid,
    (t.value ->> 'delta')::integer
  from jsonb_array_elements(p_allocations) as t(value);

  for elem in
    select value
    from jsonb_array_elements(p_allocations) as t(value)
    order by (t.value ->> 'inventory_lot_id')::uuid
  loop
    lot_id := (elem ->> 'inventory_lot_id')::uuid;
    line_delta := (elem ->> 'delta')::integer;

    update public.inventory_lots lot
    set quantity = lot.quantity + line_delta,
        updated_at = now()
    where lot.id = lot_id
      and lot.quantity + line_delta >= 0;

    get diagnostics updated = row_count;
    if updated <> 1 then
      raise exception 'insufficient_stock' using errcode = 'P0001';
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'status', 'applied',
    'operation_id', p_operation_id
  );
end;
$$;

create or replace function public.apply_inventory_delta(
  p_operation_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_inventory_lot_id uuid,
  p_delta integer,
  p_operation_type text,
  p_client_created_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_inventory_lot_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_lot');
  end if;

  return public.apply_inventory_command(
    p_operation_id,
    p_product_id,
    p_location_id,
    p_operation_type,
    jsonb_build_array(
      jsonb_build_object(
        'inventory_lot_id', p_inventory_lot_id,
        'delta', p_delta
      )
    ),
    p_client_created_at
  );
end;
$$;

revoke all on function public.apply_inventory_command(
  uuid, uuid, uuid, text, jsonb, timestamptz
) from public, anon;

grant execute on function public.apply_inventory_command(
  uuid, uuid, uuid, text, jsonb, timestamptz
) to authenticated;

revoke all on function public.apply_inventory_delta(
  uuid, uuid, uuid, uuid, integer, text, timestamptz
) from public, anon;

grant execute on function public.apply_inventory_delta(
  uuid, uuid, uuid, uuid, integer, text, timestamptz
) to authenticated;
