-- Atomic purchased-stock → inventory put-away.
-- History is ADD (same as local put-away). Identity from auth.uid() only.

create or replace function public.put_away_purchased_stock(
  p_operation_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_quantity integer,
  p_expiration_date date default null,
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
  existing public.inventory_operations%rowtype;
  existing_exp date;
  lot_id uuid;
  created_lot boolean := false;
  pool_qty integer := 0;
  remaining integer;
  stock_row public.purchased_stock%rowtype;
  updated integer;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'unauthorized');
  end if;

  if p_operation_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_operation');
  end if;

  if p_quantity is null or p_quantity <= 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_quantity');
  end if;

  if p_product_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_product');
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

  perform pg_advisory_xact_lock(
    ('x' || substr(replace(p_operation_id::text, '-', ''), 1, 16))::bit(64)::bigint
  );

  select * into existing
  from public.inventory_operations io
  where io.operation_id = p_operation_id;

  if found then
    existing_exp := null;
    if existing.inventory_lot_id is not null then
      select lot.expiration_date into existing_exp
      from public.inventory_lots lot
      where lot.id = existing.inventory_lot_id;
    end if;

    if existing.product_id is not distinct from p_product_id
       and existing.location_id is not distinct from p_location_id
       and existing.operation_type is not distinct from 'ADD'
       and existing.delta is not distinct from p_quantity
       and existing_exp is not distinct from p_expiration_date then
      return jsonb_build_object(
        'ok', true,
        'status', 'already_applied',
        'operation_id', p_operation_id
      );
    end if;

    return jsonb_build_object('ok', false, 'code', 'conflict');
  end if;

  perform 1
  from public.purchased_stock ps
  where ps.household_id = hid
    and ps.product_id = p_product_id
  order by ps.id
  for update;

  select coalesce(sum(ps.quantity), 0) into pool_qty
  from public.purchased_stock ps
  where ps.household_id = hid
    and ps.product_id = p_product_id;

  if pool_qty < p_quantity then
    return jsonb_build_object('ok', false, 'code', 'insufficient_stock');
  end if;

  select lot.id into lot_id
  from public.inventory_lots lot
  where lot.household_id = hid
    and lot.product_id = p_product_id
    and lot.location_id = p_location_id
    and lot.expiration_date is not distinct from p_expiration_date
  order by lot.id
  limit 1
  for update;

  if lot_id is null then
    lot_id := gen_random_uuid();
    insert into public.inventory_lots (
      id,
      household_id,
      product_id,
      location_id,
      quantity,
      expiration_date
    ) values (
      lot_id,
      hid,
      p_product_id,
      p_location_id,
      0,
      p_expiration_date
    );
    created_lot := true;
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
      lot_id,
      p_quantity,
      'ADD',
      p_client_created_at
    );
  exception
    when unique_violation then
      if created_lot then
        raise;
      end if;

      select * into existing
      from public.inventory_operations io
      where io.operation_id = p_operation_id;

      existing_exp := null;
      if existing.inventory_lot_id is not null then
        select lot.expiration_date into existing_exp
        from public.inventory_lots lot
        where lot.id = existing.inventory_lot_id;
      end if;

      if existing.product_id is not distinct from p_product_id
         and existing.location_id is not distinct from p_location_id
         and existing.operation_type is not distinct from 'ADD'
         and existing.delta is not distinct from p_quantity
         and existing_exp is not distinct from p_expiration_date then
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
  ) values (
    p_operation_id,
    hid,
    lot_id,
    p_quantity
  );

  update public.inventory_lots lot
  set quantity = lot.quantity + p_quantity,
      updated_at = now()
  where lot.id = lot_id
    and lot.quantity + p_quantity >= 0;

  get diagnostics updated = row_count;
  if updated <> 1 then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  end if;

  remaining := p_quantity;
  for stock_row in
    select *
    from public.purchased_stock ps
    where ps.household_id = hid
      and ps.product_id = p_product_id
    order by ps.created_at, ps.id
  loop
    exit when remaining <= 0;
    if stock_row.quantity <= remaining then
      remaining := remaining - stock_row.quantity;
      delete from public.purchased_stock ps
      where ps.id = stock_row.id;
    else
      update public.purchased_stock ps
      set quantity = stock_row.quantity - remaining,
          updated_at = now()
      where ps.id = stock_row.id;
      remaining := 0;
    end if;
  end loop;

  if remaining <> 0 then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  end if;

  select coalesce(sum(ps.quantity), 0) into pool_qty
  from public.purchased_stock ps
  where ps.household_id = hid
    and ps.product_id = p_product_id;

  if pool_qty = 0 then
    update public.shopping_items si
    set status = 'STORED',
        updated_at = now()
    where si.household_id = hid
      and si.product_id = p_product_id
      and si.status = 'PURCHASED'
      and si.free_text is null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'applied',
    'operation_id', p_operation_id
  );
end;
$$;

revoke all on function public.put_away_purchased_stock(
  uuid, uuid, uuid, integer, date, timestamptz
) from public, anon;

grant execute on function public.put_away_purchased_stock(
  uuid, uuid, uuid, integer, date, timestamptz
) to authenticated;
