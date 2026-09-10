-- Atomic MOVE on apply_inventory_command.
-- ADD/REMOVE paths stay identical. Parent MOVE.delta is the moved quantity.

alter table public.inventory_operations
  drop constraint inventory_operations_type_valid;

alter table public.inventory_operations
  add constraint inventory_operations_type_valid check (
    operation_type in (
      'ADD',
      'REMOVE',
      'MOVE',
      'MOVE_IN',
      'MOVE_OUT',
      'ADJUST',
      'PUT_AWAY'
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
  line_loc uuid;
  line_household uuid;
  has_expiration boolean;
  exp_date date;
  lot_household uuid;
  lot_product uuid;
  lot_location uuid;
  lot_quantity integer;
  lot_expiration date;
  total_delta integer := 0;
  move_quantity integer := 0;
  parent_delta integer;
  seen_ids uuid[] := '{}';
  create_ids uuid[] := '{}';
  create_exps date[] := '{}';
  create_locs uuid[] := '{}';
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

  if p_operation_type not in ('ADD', 'REMOVE', 'MOVE') then
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

    if p_operation_type = 'MOVE' then
      if elem ->> 'location_id' is null or btrim(elem ->> 'location_id') = '' then
        return jsonb_build_object('ok', false, 'code', 'invalid_operation');
      end if;

      begin
        line_loc := (elem ->> 'location_id')::uuid;
      exception
        when invalid_text_representation then
          return jsonb_build_object('ok', false, 'code', 'invalid_location');
      end;

      select l.household_id into line_household
      from public.locations l
      where l.id = line_loc;

      if line_household is null or line_household is distinct from hid then
        return jsonb_build_object('ok', false, 'code', 'invalid_location');
      end if;

      if line_delta < 0 then
        if line_loc is distinct from p_location_id then
          return jsonb_build_object('ok', false, 'code', 'invalid_move');
        end if;
        move_quantity := move_quantity + (-line_delta);
      else
        if line_loc is not distinct from p_location_id then
          return jsonb_build_object('ok', false, 'code', 'invalid_move');
        end if;
      end if;
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

  if p_operation_type = 'MOVE' then
    if total_delta <> 0 or move_quantity = 0 then
      return jsonb_build_object('ok', false, 'code', 'invalid_quantity');
    end if;
    parent_delta := move_quantity;
  else
    if total_delta = 0 then
      return jsonb_build_object('ok', false, 'code', 'invalid_quantity');
    end if;
    parent_delta := total_delta;
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
       and existing.delta is not distinct from parent_delta
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
    if p_operation_type = 'MOVE' then
      line_loc := (elem ->> 'location_id')::uuid;
    else
      line_loc := p_location_id;
    end if;
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
         or lot_location is distinct from line_loc then
        return jsonb_build_object('ok', false, 'code', 'invalid_lot');
      end if;

      if has_expiration and lot_expiration is distinct from exp_date then
        return jsonb_build_object('ok', false, 'code', 'invalid_lot');
      end if;

      if lot_quantity + line_delta < 0 then
        return jsonb_build_object('ok', false, 'code', 'insufficient_stock');
      end if;
    else
      if (
           p_operation_type = 'ADD'
           or (p_operation_type = 'MOVE' and line_delta > 0)
         )
         and has_expiration then
        create_ids := array_append(create_ids, lot_id);
        create_exps := array_append(create_exps, exp_date);
        create_locs := array_append(create_locs, line_loc);
      else
        return jsonb_build_object('ok', false, 'code', 'invalid_lot');
      end if;
    end if;
  end loop;

  if p_operation_type = 'MOVE' then
    parent_lot := null;
  elsif jsonb_array_length(p_allocations) = 1 then
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
          create_locs[i],
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
      parent_delta,
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
         and existing.delta is not distinct from parent_delta
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
