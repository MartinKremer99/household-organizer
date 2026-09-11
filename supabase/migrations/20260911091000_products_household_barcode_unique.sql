-- Household-scoped unique barcodes. Null barcodes remain allowed.

create unique index products_household_id_barcode_key
  on public.products (household_id, barcode)
  where barcode is not null;

create or replace function public.apply_catalog_command(
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
  existing public.catalog_operations%rowtype;
  entity_id uuid;
  entity_name text;
  new_category_id uuid;
  new_minimum_stock integer;
  barcode text;
  current_category public.categories%rowtype;
  current_location public.locations%rowtype;
  current_product public.products%rowtype;
  sort_order integer;
  constraint_name text;
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
     or p_payload is null
     or p_payload ->> 'id' is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_operation');
  end if;

  begin
    entity_id := (p_payload ->> 'id')::uuid;
  exception
    when invalid_text_representation then
      return jsonb_build_object('ok', false, 'code', 'invalid_operation');
  end;

  perform pg_advisory_xact_lock(
    ('x' || substr(replace(p_operation_id::text, '-', ''), 1, 16))::bit(64)::bigint
  );

  select * into existing
  from public.catalog_operations co
  where co.operation_id = p_operation_id;

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

  if p_operation_type in ('CREATE_CATEGORY', 'RENAME_CATEGORY') then
    entity_name := btrim(p_payload ->> 'name');
    if entity_name is null or entity_name = '' or char_length(entity_name) > 80 then
      return jsonb_build_object('ok', false, 'code', 'invalid_name');
    end if;
  end if;

  if p_operation_type in ('CREATE_LOCATION', 'RENAME_LOCATION') then
    entity_name := btrim(p_payload ->> 'name');
    if entity_name is null or entity_name = '' or char_length(entity_name) > 80 then
      return jsonb_build_object('ok', false, 'code', 'invalid_name');
    end if;
  end if;

  if p_operation_type in ('CREATE_PRODUCT', 'RENAME_PRODUCT') then
    entity_name := btrim(p_payload ->> 'name');
    if entity_name is null or entity_name = '' or char_length(entity_name) > 80 then
      return jsonb_build_object('ok', false, 'code', 'invalid_name');
    end if;
  end if;

  if p_operation_type = 'CREATE_CATEGORY' then
    begin
      insert into public.categories (id, household_id, name)
      values (entity_id, hid, entity_name);
    exception
      when unique_violation then
        if exists (
          select 1 from public.categories c
          where c.id = entity_id and c.household_id = hid and lower(c.name) = lower(entity_name)
        ) then
          return jsonb_build_object('ok', true, 'status', 'already_applied', 'operation_id', p_operation_id);
        end if;
        return jsonb_build_object('ok', false, 'code', 'duplicate_name');
    end;
  elsif p_operation_type = 'RENAME_CATEGORY' then
    select * into current_category from public.categories c where c.id = entity_id and c.household_id = hid;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;
    begin
      update public.categories
      set name = entity_name, updated_at = now()
      where id = entity_id and household_id = hid;
    exception
      when unique_violation then
        return jsonb_build_object('ok', false, 'code', 'duplicate_name');
    end;
  elsif p_operation_type = 'ARCHIVE_CATEGORY' then
    select * into current_category from public.categories c where c.id = entity_id and c.household_id = hid;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;
    if exists (select 1 from public.products p where p.household_id = hid and p.category_id = entity_id) then
      return jsonb_build_object('ok', false, 'code', 'category_in_use');
    end if;
    update public.categories
    set is_active = false, updated_at = now()
    where id = entity_id and household_id = hid;
  elsif p_operation_type = 'CREATE_LOCATION' then
    select coalesce(max(l.sort_order), -1) + 1 into sort_order
    from public.locations l
    where l.household_id = hid;
    begin
      insert into public.locations (id, household_id, name, sort_order)
      values (entity_id, hid, entity_name, sort_order);
    exception
      when unique_violation then
        if exists (
          select 1 from public.locations l
          where l.id = entity_id and l.household_id = hid and lower(l.name) = lower(entity_name)
        ) then
          return jsonb_build_object('ok', true, 'status', 'already_applied', 'operation_id', p_operation_id);
        end if;
        return jsonb_build_object('ok', false, 'code', 'duplicate_name');
    end;
  elsif p_operation_type = 'RENAME_LOCATION' then
    select * into current_location from public.locations l where l.id = entity_id and l.household_id = hid;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;
    begin
      update public.locations
      set name = entity_name, updated_at = now()
      where id = entity_id and household_id = hid;
    exception
      when unique_violation then
        return jsonb_build_object('ok', false, 'code', 'duplicate_name');
    end;
  elsif p_operation_type = 'ARCHIVE_LOCATION' then
    select * into current_location from public.locations l where l.id = entity_id and l.household_id = hid;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;
    update public.locations
    set is_active = false, updated_at = now()
    where id = entity_id and household_id = hid;
  elsif p_operation_type = 'CREATE_PRODUCT' then
    begin
      new_category_id := (p_payload ->> 'category_id')::uuid;
      new_minimum_stock := coalesce((p_payload ->> 'minimum_stock')::integer, 0);
    exception
      when others then
        return jsonb_build_object('ok', false, 'code', 'invalid_operation');
    end;
    if new_minimum_stock < 0 then
      return jsonb_build_object('ok', false, 'code', 'invalid_minimum_stock');
    end if;
    if not exists (
      select 1 from public.categories c
      where c.id = new_category_id and c.household_id = hid and c.is_active
    ) then
      return jsonb_build_object('ok', false, 'code', 'invalid_category');
    end if;
    barcode := nullif(btrim(p_payload ->> 'barcode'), '');
    begin
      insert into public.products (id, household_id, name, category_id, minimum_stock, barcode)
      values (entity_id, hid, entity_name, new_category_id, new_minimum_stock, barcode);
    exception
      when unique_violation then
        get stacked diagnostics constraint_name = constraint_name;
        if exists (
          select 1 from public.products p
          where p.id = entity_id and p.household_id = hid
        ) then
          return jsonb_build_object('ok', true, 'status', 'already_applied', 'operation_id', p_operation_id);
        end if;
        if constraint_name = 'products_household_id_barcode_key' then
          return jsonb_build_object('ok', false, 'code', 'duplicate_barcode');
        end if;
        return jsonb_build_object('ok', false, 'code', 'duplicate_name');
    end;
  elsif p_operation_type = 'RENAME_PRODUCT' then
    select * into current_product from public.products p where p.id = entity_id and p.household_id = hid;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;
    begin
      update public.products
      set name = entity_name, updated_at = now()
      where id = entity_id and household_id = hid;
    exception
      when unique_violation then
        return jsonb_build_object('ok', false, 'code', 'duplicate_name');
    end;
  elsif p_operation_type = 'CHANGE_PRODUCT_CATEGORY' then
    begin
      new_category_id := (p_payload ->> 'category_id')::uuid;
    exception
      when others then
        return jsonb_build_object('ok', false, 'code', 'invalid_operation');
    end;
    select * into current_product from public.products p where p.id = entity_id and p.household_id = hid;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;
    if not exists (
      select 1 from public.categories c
      where c.id = new_category_id and c.household_id = hid and c.is_active
    ) then
      return jsonb_build_object('ok', false, 'code', 'invalid_category');
    end if;
    update public.products
    set category_id = new_category_id, updated_at = now()
    where id = entity_id and household_id = hid;
  elsif p_operation_type = 'CHANGE_PRODUCT_MINIMUM_STOCK' then
    begin
      new_minimum_stock := (p_payload ->> 'minimum_stock')::integer;
    exception
      when others then
        return jsonb_build_object('ok', false, 'code', 'invalid_minimum_stock');
    end;
    if new_minimum_stock is null or new_minimum_stock < 0 then
      return jsonb_build_object('ok', false, 'code', 'invalid_minimum_stock');
    end if;
    select * into current_product from public.products p where p.id = entity_id and p.household_id = hid;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;
    update public.products
    set minimum_stock = new_minimum_stock, updated_at = now()
    where id = entity_id and household_id = hid;
  elsif p_operation_type = 'ARCHIVE_PRODUCT' then
    select * into current_product from public.products p where p.id = entity_id and p.household_id = hid;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;
    update public.products
    set is_active = false, updated_at = now()
    where id = entity_id and household_id = hid;
  else
    return jsonb_build_object('ok', false, 'code', 'invalid_operation');
  end if;

  insert into public.catalog_operations (
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

revoke all on function public.apply_catalog_command(uuid, text, jsonb, timestamp with time zone) from public, anon;
grant execute on function public.apply_catalog_command(uuid, text, jsonb, timestamp with time zone) to authenticated;
