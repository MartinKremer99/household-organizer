-- Household membership RLS. No SECURITY DEFINER helper.
-- household_members SELECT is own rows only so other policies can EXISTS
-- through RLS without recursion. No authenticated INSERT on households or
-- household_members (CURSOR-008 / CURSOR-009). No household DELETE.

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.categories enable row level security;
alter table public.locations enable row level security;
alter table public.products enable row level security;
alter table public.inventory_lots enable row level security;
alter table public.inventory_operations enable row level security;
alter table public.purchased_stock enable row level security;
alter table public.shopping_items enable row level security;

-- ---------------------------------------------------------------------------
-- household_members
-- ---------------------------------------------------------------------------
create policy household_members_select
  on public.household_members
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- households
-- ---------------------------------------------------------------------------
create policy households_select
  on public.households
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = households.id
        and hm.user_id = (select auth.uid())
    )
  );

create policy households_update
  on public.households
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = households.id
        and hm.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = households.id
        and hm.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create policy categories_select
  on public.categories
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = categories.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy categories_insert
  on public.categories
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = categories.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy categories_update
  on public.categories
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = categories.household_id
        and hm.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = categories.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy categories_delete
  on public.categories
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = categories.household_id
        and hm.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- locations
-- ---------------------------------------------------------------------------
create policy locations_select
  on public.locations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = locations.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy locations_insert
  on public.locations
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = locations.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy locations_update
  on public.locations
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = locations.household_id
        and hm.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = locations.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy locations_delete
  on public.locations
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = locations.household_id
        and hm.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
create policy products_select
  on public.products
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = products.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy products_insert
  on public.products
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = products.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy products_update
  on public.products
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = products.household_id
        and hm.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = products.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy products_delete
  on public.products
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = products.household_id
        and hm.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- inventory_lots
-- ---------------------------------------------------------------------------
create policy inventory_lots_select
  on public.inventory_lots
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = inventory_lots.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy inventory_lots_insert
  on public.inventory_lots
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = inventory_lots.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy inventory_lots_update
  on public.inventory_lots
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = inventory_lots.household_id
        and hm.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = inventory_lots.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy inventory_lots_delete
  on public.inventory_lots
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = inventory_lots.household_id
        and hm.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- inventory_operations
-- ---------------------------------------------------------------------------
create policy inventory_operations_select
  on public.inventory_operations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = inventory_operations.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy inventory_operations_insert
  on public.inventory_operations
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = inventory_operations.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy inventory_operations_update
  on public.inventory_operations
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = inventory_operations.household_id
        and hm.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = inventory_operations.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy inventory_operations_delete
  on public.inventory_operations
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = inventory_operations.household_id
        and hm.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- purchased_stock
-- ---------------------------------------------------------------------------
create policy purchased_stock_select
  on public.purchased_stock
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = purchased_stock.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy purchased_stock_insert
  on public.purchased_stock
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = purchased_stock.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy purchased_stock_update
  on public.purchased_stock
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = purchased_stock.household_id
        and hm.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = purchased_stock.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy purchased_stock_delete
  on public.purchased_stock
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = purchased_stock.household_id
        and hm.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- shopping_items
-- ---------------------------------------------------------------------------
create policy shopping_items_select
  on public.shopping_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = shopping_items.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy shopping_items_insert
  on public.shopping_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = shopping_items.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy shopping_items_update
  on public.shopping_items
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = shopping_items.household_id
        and hm.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = shopping_items.household_id
        and hm.user_id = (select auth.uid())
    )
  );

create policy shopping_items_delete
  on public.shopping_items
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.household_id = shopping_items.household_id
        and hm.user_id = (select auth.uid())
    )
  );
