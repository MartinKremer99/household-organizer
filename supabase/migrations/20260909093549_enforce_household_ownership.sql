-- Prevent cross-household references that single-column FKs cannot catch.
-- Existing id-only FKs stay in place. These composite FKs require UNIQUE
-- (household_id, id) on the referenced tables (id is already the PK).
--
-- inventory_operations.inventory_lot_id uses ON DELETE RESTRICT on the
-- composite key because ON DELETE SET NULL would also null household_id.

alter table public.categories
  add constraint categories_household_id_id_key
  unique (household_id, id);

alter table public.locations
  add constraint locations_household_id_id_key
  unique (household_id, id);

alter table public.products
  add constraint products_household_id_id_key
  unique (household_id, id);

alter table public.inventory_lots
  add constraint inventory_lots_household_id_id_key
  unique (household_id, id);

alter table public.products
  add constraint products_household_category_fkey
  foreign key (household_id, category_id)
  references public.categories (household_id, id)
  on delete restrict;

alter table public.inventory_lots
  add constraint inventory_lots_household_product_fkey
  foreign key (household_id, product_id)
  references public.products (household_id, id)
  on delete restrict;

alter table public.inventory_lots
  add constraint inventory_lots_household_location_fkey
  foreign key (household_id, location_id)
  references public.locations (household_id, id)
  on delete restrict;

alter table public.inventory_operations
  add constraint inventory_operations_household_product_fkey
  foreign key (household_id, product_id)
  references public.products (household_id, id)
  on delete restrict;

alter table public.inventory_operations
  add constraint inventory_operations_household_location_fkey
  foreign key (household_id, location_id)
  references public.locations (household_id, id)
  on delete restrict;

alter table public.inventory_operations
  add constraint inventory_operations_household_lot_fkey
  foreign key (household_id, inventory_lot_id)
  references public.inventory_lots (household_id, id)
  on delete restrict;

alter table public.purchased_stock
  add constraint purchased_stock_household_product_fkey
  foreign key (household_id, product_id)
  references public.products (household_id, id)
  on delete restrict;

alter table public.shopping_items
  add constraint shopping_items_household_product_fkey
  foreign key (household_id, product_id)
  references public.products (household_id, id)
  on delete restrict;
