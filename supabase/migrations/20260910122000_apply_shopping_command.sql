-- Idempotent shopping mutations except put-away. Household from auth.uid().

create table public.shopping_operations (
  operation_id uuid primary key,
  household_id uuid not null references public.households (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  operation_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint shopping_operations_type_valid check (
    operation_type in (
      'ADD_SHOPPING_ITEM',
      'CHANGE_SHOPPING_QUANTITY',
      'MARK_SHOPPING_PURCHASED',
      'CONSUME_PURCHASED_STOCK',
      'MARK_FREE_TEXT_STORED'
    )
  )
);

alter table public.shopping_operations enable row level security;

create policy shopping_operations_select
  on public.shopping_operations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = shopping_operations.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create or replace function public.apply_shopping_command(
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
  existing public.shopping_operations%rowtype;
  item_id uuid;
  target_product_id uuid;
  free_text text;
  qty integer;
  current_item public.shopping_items%rowtype;
  pending_item public.shopping_items%rowtype;
  pool public.purchased_stock%rowtype;
  available integer;
  remaining integer;
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

  if p_operation_id is null or p_operation_type is null or p_payload is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_operation');
  end if;

  perform pg_advisory_xact_lock(
    ('x' || substr(replace(p_operation_id::text, '-', ''), 1, 16))::bit(64)::bigint
  );

  select * into existing
  from public.shopping_operations so
  where so.operation_id = p_operation_id;

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

  if p_operation_type = 'ADD_SHOPPING_ITEM' then
    begin
      item_id := (p_payload ->> 'id')::uuid;
      qty := (p_payload ->> 'quantity')::integer;
      if p_payload ? 'product_id' and p_payload ->> 'product_id' is not null then
        target_product_id := (p_payload ->> 'product_id')::uuid;
      else
        target_product_id := null;
      end if;
    exception
      when others then
        return jsonb_build_object('ok', false, 'code', 'invalid_operation');
    end;
    free_text := nullif(btrim(p_payload ->> 'free_text'), '');
    if qty is null or qty <= 0 or item_id is null then
      return jsonb_build_object('ok', false, 'code', 'invalid_quantity');
    end if;
    if (target_product_id is null and free_text is null)
       or (target_product_id is not null and free_text is not null) then
      return jsonb_build_object('ok', false, 'code', 'invalid_operation');
    end if;
    if target_product_id is not null then
      if not exists (
        select 1 from public.products p
        where p.id = target_product_id and p.household_id = hid and p.is_active
      ) then
        return jsonb_build_object('ok', false, 'code', 'invalid_product');
      end if;
      select * into pending_item
      from public.shopping_items si
      where si.household_id = hid
        and si.product_id = target_product_id
        and si.status = 'PENDING'
      order by si.created_at, si.id
      limit 1;
      if found then
        update public.shopping_items
        set quantity = pending_item.quantity + qty, updated_at = now()
        where id = pending_item.id;
      else
        insert into public.shopping_items (
          id, household_id, product_id, free_text, quantity, status, created_by
        ) values (
          item_id, hid, target_product_id, null, qty, 'PENDING', uid
        );
      end if;
    else
      insert into public.shopping_items (
        id, household_id, product_id, free_text, quantity, status, created_by
      ) values (
        item_id, hid, null, free_text, qty, 'PENDING', uid
      );
    end if;
  elsif p_operation_type = 'CHANGE_SHOPPING_QUANTITY' then
    begin
      item_id := (p_payload ->> 'id')::uuid;
      qty := (p_payload ->> 'quantity')::integer;
    exception
      when others then
        return jsonb_build_object('ok', false, 'code', 'invalid_operation');
    end;
    if qty is null or qty <= 0 then
      return jsonb_build_object('ok', false, 'code', 'invalid_quantity');
    end if;
    select * into current_item
    from public.shopping_items si
    where si.id = item_id and si.household_id = hid;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'invalid_shopping_item');
    end if;
    if current_item.status <> 'PENDING' then
      return jsonb_build_object('ok', false, 'code', 'invalid_transition');
    end if;
    update public.shopping_items
    set quantity = qty, updated_at = now()
    where id = item_id and household_id = hid;
  elsif p_operation_type = 'MARK_SHOPPING_PURCHASED' then
    begin
      item_id := (p_payload ->> 'id')::uuid;
    exception
      when others then
        return jsonb_build_object('ok', false, 'code', 'invalid_operation');
    end;
    select * into current_item
    from public.shopping_items si
    where si.id = item_id and si.household_id = hid;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'invalid_shopping_item');
    end if;
    if current_item.status <> 'PENDING' then
      return jsonb_build_object('ok', false, 'code', 'invalid_transition');
    end if;
    update public.shopping_items
    set status = 'PURCHASED',
        purchased_at = now(),
        purchased_by = uid,
        updated_at = now()
    where id = item_id and household_id = hid;
    if current_item.product_id is not null then
      select * into pool
      from public.purchased_stock ps
      where ps.household_id = hid and ps.product_id = current_item.product_id
      order by ps.created_at, ps.id
      limit 1;
      if found then
        update public.purchased_stock
        set quantity = pool.quantity + current_item.quantity, updated_at = now()
        where id = pool.id;
        delete from public.purchased_stock ps
        where ps.household_id = hid
          and ps.product_id = current_item.product_id
          and ps.id <> pool.id;
      else
        insert into public.purchased_stock (household_id, product_id, quantity)
        values (hid, current_item.product_id, current_item.quantity);
      end if;
    end if;
  elsif p_operation_type = 'CONSUME_PURCHASED_STOCK' then
    begin
      target_product_id := (p_payload ->> 'product_id')::uuid;
      qty := (p_payload ->> 'quantity')::integer;
    exception
      when others then
        return jsonb_build_object('ok', false, 'code', 'invalid_operation');
    end;
    if qty is null or qty <= 0 then
      return jsonb_build_object('ok', false, 'code', 'invalid_quantity');
    end if;
    if not exists (
      select 1 from public.products p
      where p.id = target_product_id and p.household_id = hid
    ) then
      return jsonb_build_object('ok', false, 'code', 'invalid_product');
    end if;
    select coalesce(sum(ps.quantity), 0) into available
    from public.purchased_stock ps
    where ps.household_id = hid and ps.product_id = target_product_id;
    if available < qty then
      return jsonb_build_object('ok', false, 'code', 'insufficient_stock');
    end if;
    remaining := available - qty;
    select * into pool
    from public.purchased_stock ps
    where ps.household_id = hid and ps.product_id = target_product_id
    order by ps.created_at, ps.id
    limit 1;
    if remaining = 0 then
      delete from public.purchased_stock ps
      where ps.household_id = hid and ps.product_id = target_product_id;
      update public.shopping_items
      set status = 'STORED', updated_at = now()
      where household_id = hid
        and product_id = target_product_id
        and status = 'PURCHASED';
    elsif found then
      update public.purchased_stock
      set quantity = remaining, updated_at = now()
      where id = pool.id;
      delete from public.purchased_stock ps
      where ps.household_id = hid and ps.product_id = target_product_id and ps.id <> pool.id;
    end if;
  elsif p_operation_type = 'MARK_FREE_TEXT_STORED' then
    begin
      item_id := (p_payload ->> 'id')::uuid;
    exception
      when others then
        return jsonb_build_object('ok', false, 'code', 'invalid_operation');
    end;
    select * into current_item
    from public.shopping_items si
    where si.id = item_id and si.household_id = hid;
    if not found or current_item.free_text is null or current_item.product_id is not null then
      return jsonb_build_object('ok', false, 'code', 'invalid_shopping_item');
    end if;
    if current_item.status <> 'PURCHASED' then
      return jsonb_build_object('ok', false, 'code', 'invalid_transition');
    end if;
    update public.shopping_items
    set status = 'STORED', updated_at = now()
    where id = item_id and household_id = hid;
  else
    return jsonb_build_object('ok', false, 'code', 'invalid_operation');
  end if;

  insert into public.shopping_operations (
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

revoke all on function public.apply_shopping_command(uuid, text, jsonb, timestamp with time zone) from public, anon;
grant execute on function public.apply_shopping_command(uuid, text, jsonb, timestamp with time zone) to authenticated;
