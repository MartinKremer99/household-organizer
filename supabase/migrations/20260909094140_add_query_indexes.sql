-- Query indexes for expected household access patterns.
-- Archive remains is_active + ON DELETE RESTRICT; no new archive constraints.

create index household_members_user_id_household_id_idx
  on public.household_members (user_id, household_id);

create index categories_household_id_is_active_idx
  on public.categories (household_id, is_active);

create index locations_household_id_is_active_sort_order_idx
  on public.locations (household_id, is_active, sort_order);

create index products_household_id_is_active_idx
  on public.products (household_id, is_active);

create index products_household_id_category_id_idx
  on public.products (household_id, category_id);

create index inventory_lots_household_id_product_id_location_id_idx
  on public.inventory_lots (household_id, product_id, location_id);

create index inventory_lots_household_id_location_id_idx
  on public.inventory_lots (household_id, location_id);

create index inventory_lots_household_id_expiration_date_idx
  on public.inventory_lots (household_id, expiration_date)
  where expiration_date is not null;

create index inventory_operations_household_id_created_at_idx
  on public.inventory_operations (household_id, created_at);

create index inventory_operations_household_id_product_id_created_at_idx
  on public.inventory_operations (household_id, product_id, created_at);

create index purchased_stock_household_id_product_id_idx
  on public.purchased_stock (household_id, product_id);

create index shopping_items_household_id_status_idx
  on public.shopping_items (household_id, status);

create index shopping_items_household_id_product_id_status_idx
  on public.shopping_items (household_id, product_id, status);
