-- Initial household domain schema.
-- Query-performance indexes and RLS are later roadmap tasks (CURSOR-005, CURSOR-006).
-- Seed categories/locations when a household is created, not in this migration.

-- ---------------------------------------------------------------------------
-- households
-- ---------------------------------------------------------------------------
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- household_members
-- Links auth.users to a household. Composite PK matches DATABASE.md.
-- No ON DELETE CASCADE: membership and history are retired explicitly.
-- ---------------------------------------------------------------------------
create table public.household_members (
  household_id uuid not null references public.households (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- ---------------------------------------------------------------------------
-- categories
-- is_active supports archive-instead-of-delete.
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index categories_household_id_lower_name_key
  on public.categories (household_id, lower(name));

-- ---------------------------------------------------------------------------
-- locations
-- ---------------------------------------------------------------------------
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index locations_household_id_lower_name_key
  on public.locations (household_id, lower(name));

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  name text not null,
  category_id uuid not null references public.categories (id) on delete restrict,
  minimum_stock integer not null default 0,
  barcode text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_minimum_stock_nonnegative check (minimum_stock >= 0)
);

create unique index products_household_id_lower_name_key
  on public.products (household_id, lower(name));

-- ---------------------------------------------------------------------------
-- inventory_lots
-- quantity is a derived current representation. Deltas live in inventory_operations.
-- Multiple lots of the same product/location are allowed (different expiration).
-- ---------------------------------------------------------------------------
create table public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  location_id uuid not null references public.locations (id) on delete restrict,
  quantity integer not null,
  expiration_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_lots_quantity_nonnegative check (quantity >= 0)
);

-- ---------------------------------------------------------------------------
-- inventory_operations
-- Append-only change log. operation_id is client-generated for idempotent retries.
-- inventory_lot_id is nullable so a later lot cleanup does not erase history.
-- ---------------------------------------------------------------------------
create table public.inventory_operations (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  household_id uuid not null references public.households (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  location_id uuid not null references public.locations (id) on delete restrict,
  inventory_lot_id uuid references public.inventory_lots (id) on delete set null,
  delta integer not null,
  operation_type text not null,
  created_at timestamptz not null default now(),
  client_created_at timestamptz,
  constraint inventory_operations_delta_nonzero check (delta <> 0),
  constraint inventory_operations_type_valid check (
    operation_type in ('ADD', 'REMOVE', 'MOVE_IN', 'MOVE_OUT', 'ADJUST', 'PUT_AWAY')
  )
);

-- ---------------------------------------------------------------------------
-- purchased_stock
-- Bought but not yet assigned to inventory locations. quantity > 0.
-- ---------------------------------------------------------------------------
create table public.purchased_stock (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchased_stock_quantity_positive check (quantity > 0)
);

-- ---------------------------------------------------------------------------
-- shopping_items
-- Exactly one of product_id or free_text. Status is the V1 shopping lifecycle.
-- ---------------------------------------------------------------------------
create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  product_id uuid references public.products (id) on delete restrict,
  free_text text,
  quantity integer not null,
  status text not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  purchased_at timestamptz,
  purchased_by uuid references auth.users (id) on delete restrict,
  constraint shopping_items_quantity_positive check (quantity > 0),
  constraint shopping_items_status_valid check (
    status in ('PENDING', 'PURCHASED', 'STORED')
  ),
  constraint shopping_items_product_xor_free_text check (
    (product_id is not null and free_text is null)
    or (product_id is null and free_text is not null)
  )
);
