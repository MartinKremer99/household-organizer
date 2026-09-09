-- Apply one inventory delta idempotently.
-- SECURITY DEFINER bypasses RLS; membership is checked against auth.uid()
-- and the household derived from the product. Caller cannot choose user_id
-- or household_id. Null inventory_lot_id is rejected (no server FEFO).

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
declare
  uid uuid := auth.uid();
  hid uuid;
  location_household uuid;
  lot_household uuid;
  lot_product uuid;
  lot_location uuid;
  lot_quantity integer;
  existing public.inventory_operations%rowtype;
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

  if p_delta is null or p_delta = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_quantity');
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

  if p_inventory_lot_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_lot');
  end if;

  select lot.household_id, lot.product_id, lot.location_id
  into lot_household, lot_product, lot_location
  from public.inventory_lots lot
  where lot.id = p_inventory_lot_id;

  if lot_household is null
     or lot_household is distinct from hid
     or lot_product is distinct from p_product_id
     or lot_location is distinct from p_location_id then
    return jsonb_build_object('ok', false, 'code', 'invalid_lot');
  end if;

  if p_operation_type not in ('ADD', 'REMOVE') then
    return jsonb_build_object('ok', false, 'code', 'invalid_operation');
  end if;

  if p_operation_type = 'ADD' and p_delta < 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_operation');
  end if;

  if p_operation_type = 'REMOVE' and p_delta > 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_operation');
  end if;

  perform pg_advisory_xact_lock(
    ('x' || substr(replace(p_operation_id::text, '-', ''), 1, 16))::bit(64)::bigint
  );

  select * into existing
  from public.inventory_operations io
  where io.operation_id = p_operation_id;

  if found then
    if existing.product_id is not distinct from p_product_id
       and existing.location_id is not distinct from p_location_id
       and existing.inventory_lot_id is not distinct from p_inventory_lot_id
       and existing.delta is not distinct from p_delta
       and existing.operation_type is not distinct from p_operation_type then
      return jsonb_build_object(
        'ok', true,
        'status', 'already_applied',
        'operation_id', p_operation_id
      );
    end if;

    return jsonb_build_object('ok', false, 'code', 'conflict');
  end if;

  select lot.household_id, lot.product_id, lot.location_id, lot.quantity
  into lot_household, lot_product, lot_location, lot_quantity
  from public.inventory_lots lot
  where lot.id = p_inventory_lot_id
  for update;

  if lot_household is null
     or lot_household is distinct from hid
     or lot_product is distinct from p_product_id
     or lot_location is distinct from p_location_id then
    return jsonb_build_object('ok', false, 'code', 'invalid_lot');
  end if;

  if lot_quantity + p_delta < 0 then
    return jsonb_build_object('ok', false, 'code', 'insufficient_stock');
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
      p_inventory_lot_id,
      p_delta,
      p_operation_type,
      p_client_created_at
    );
  exception
    when unique_violation then
      select * into existing
      from public.inventory_operations io
      where io.operation_id = p_operation_id;

      if existing.product_id is not distinct from p_product_id
         and existing.location_id is not distinct from p_location_id
         and existing.inventory_lot_id is not distinct from p_inventory_lot_id
         and existing.delta is not distinct from p_delta
         and existing.operation_type is not distinct from p_operation_type then
        return jsonb_build_object(
          'ok', true,
          'status', 'already_applied',
          'operation_id', p_operation_id
        );
      end if;

      return jsonb_build_object('ok', false, 'code', 'conflict');
  end;

  update public.inventory_lots lot
  set quantity = lot.quantity + p_delta,
      updated_at = now()
  where lot.id = p_inventory_lot_id
    and lot.quantity + p_delta >= 0;

  get diagnostics updated = row_count;
  if updated <> 1 then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'applied',
    'operation_id', p_operation_id
  );
end;
$$;

revoke all on function public.apply_inventory_delta(
  uuid, uuid, uuid, uuid, integer, text, timestamptz
) from public, anon;

grant execute on function public.apply_inventory_delta(
  uuid, uuid, uuid, uuid, integer, text, timestamptz
) to authenticated;
