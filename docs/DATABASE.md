# Household Organizer — Database Specification

Version: 1.0  
Status: Implementation-ready specification  
Database: PostgreSQL via Supabase

## 1. Purpose

This document defines the database/domain model for Household Organizer.

The model is designed around:

- one household with two users
- reusable products
- editable categories and locations
- inventory distributed across locations
- optional expiration dates
- shared shopping lists
- purchased-but-not-yet-stored stock
- offline operation
- concurrent changes from two devices
- append-only inventory operations where practical
- idempotent synchronization

The UI should remain simple even where the underlying model is more detailed.

---

## 2. Core design decisions

### 2.1 Inventory quantity is not an authoritative mutable field

Do not use a single `quantity` column as the authoritative source of inventory.

Inventory changes are represented by operations/deltas.

Example:

- starting stock: 4
- Martin consumes 1 while offline: `-1`
- Caroline consumes 1 while offline: `-1`
- final stock: 2

This avoids last-write-wins corruption caused by two devices independently changing an absolute quantity.

The application may maintain derived/materialized quantities for performance, but those values must be reconstructable from the operation history.

### 2.2 Inventory is lot/batch based

Expiration belongs to physical stock, not to the product itself.

A product can therefore have multiple inventory lots:

```text
Tomato Sauce
  Kitchen
    Lot A: 2, expires 2027-01-10
  Kitchen
    Lot B: 3, expires 2027-06-20
  Cellar
    Lot C: 4, no expiration
```

The UI does not need to expose full batch management in V1.

When consuming stock from a location, the application should prefer the lot with the nearest expiration date. Lots without an expiration date are used after expiring/dated lots, subject to the application's deterministic ordering rules.

### 2.3 Product identity is separate from inventory

A product remains in the database even when its stock reaches zero.

This allows:

- search for known products
- adding an existing product to shopping
- remembering category/default information
- future barcode association

Example:

```text
Tomato Sauce
Stock: 0
Shopping: 4
```

### 2.4 Shopping and inventory are separate domains

Adding an item to shopping does not change inventory.

Buying an item does not change inventory.

Inventory changes only when stock is physically put away or otherwise explicitly added/removed.

### 2.5 Archive instead of hard delete

Products, categories and locations should normally be archived rather than deleted when they have historical references.

Archived entities should not normally appear in new-item selectors, but existing references must remain valid.

---

# 3. Entities

## 3.1 households

Represents the shared household.

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| name | text | NOT NULL |
| join_code | text | UNIQUE, NOT NULL |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |

There is normally one household for this application.

The schema should nevertheless use a household ID throughout the domain so that ownership/security boundaries remain explicit.

### Rules

- The first authenticated user creates the household.
- A second user joins using a join code.
- Join code must be unique.
- Join code should be treated as a secret-like onboarding credential and should not be exposed unnecessarily.

---

## 3.2 household_members

Links Supabase Auth users to the household.

| Column | Type | Constraints |
|---|---|---|
| household_id | uuid | PK/FK households.id |
| user_id | uuid | PK/FK auth.users.id |
| created_at | timestamptz | NOT NULL DEFAULT now() |

Composite primary key:

```text
(household_id, user_id)
```

### Rules

- A user can belong to the household.
- Domain tables should normally reference `household_id`.
- RLS should determine access through household membership.
- No complex role system is required for V1.

---

# 4. Product catalog

## 4.1 categories

Editable product categories.

Initial seed data:

- Food
- Drinks
- Cleaning
- Personal Care
- Household
- Other

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| household_id | uuid | FK households.id, NOT NULL |
| name | text | NOT NULL |
| is_active | boolean | NOT NULL DEFAULT true |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |

Recommended unique constraint:

```text
(household_id, lower(name))
```

Category names should be unique within a household, case-insensitively.

---

## 4.2 locations

Represents physical household locations.

Initial seed data:

- Kitchen
- Bathroom
- Cellar
- Living room

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| household_id | uuid | FK households.id, NOT NULL |
| name | text | NOT NULL |
| is_active | boolean | NOT NULL DEFAULT true |
| sort_order | integer | NOT NULL DEFAULT 0 |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |

Recommended unique constraint:

```text
(household_id, lower(name))
```

Locations are data, not hardcoded application constants.

No sublocations in V1.

---

## 4.3 products

Reusable product definitions.

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| household_id | uuid | FK households.id, NOT NULL |
| name | text | NOT NULL |
| category_id | uuid | FK categories.id, NOT NULL |
| minimum_stock | integer | NOT NULL DEFAULT 0, >= 0 |
| barcode | text | NULL |
| is_active | boolean | NOT NULL DEFAULT true |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |

### Rules

- Quantity is integer-only.
- No units are required in V1.
- `minimum_stock = 0` means low-stock automation is disabled for that product.
- Barcode is optional and primarily prepares the model for a later barcode feature.
- Product names should be unique within a household, case-insensitively, unless a later requirement proves otherwise.

Recommended unique constraint:

```text
(household_id, lower(name))
```

---

# 5. Inventory

## 5.1 inventory_lots

Represents a physical quantity of a product at a location.

This table is the current logical grouping of stock. Changes to quantities must be driven by inventory operations.

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| household_id | uuid | FK households.id, NOT NULL |
| product_id | uuid | FK products.id, NOT NULL |
| location_id | uuid | FK locations.id, NOT NULL |
| quantity | integer | NOT NULL, >= 0 |
| expiration_date | date | NULL |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |

### Important

`quantity` here is a **derived/current representation**, not the conflict-resolution mechanism.

Inventory operations remain the authoritative change log.

Two lots of the same product may exist at the same location if their expiration dates differ.

For identical stock with no meaningful batch distinction, the application may reuse an existing compatible lot rather than creating unnecessary lots.

---

## 5.2 inventory_operations

Append-only record of inventory changes.

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| operation_id | uuid | UNIQUE, NOT NULL |
| household_id | uuid | FK households.id, NOT NULL |
| user_id | uuid | FK auth.users.id, NOT NULL |
| product_id | uuid | FK products.id, NOT NULL |
| location_id | uuid | FK locations.id, NOT NULL |
| inventory_lot_id | uuid | FK inventory_lots.id, NULL |
| delta | integer | NOT NULL, != 0 |
| operation_type | text | NOT NULL |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| client_created_at | timestamptz | NULL |

Suggested operation types:

```text
ADD
REMOVE
MOVE_IN
MOVE_OUT
ADJUST
PUT_AWAY
```

The exact enum implementation can be decided during migration work. A text column with a database check constraint is acceptable if future extensibility is preferred.

### `operation_id`

`operation_id` is critical.

It is generated by the client before sending the operation to Supabase.

If the client retries because the network response was lost, the same `operation_id` is submitted again.

The server must treat a previously processed `operation_id` as already applied.

This makes retries idempotent.

### Delta semantics

Examples:

```text
ADD        +4
REMOVE     -1
MOVE_OUT   -2
MOVE_IN    +2
PUT_AWAY   +2
```

A move between locations is represented as two operations sharing a client-side logical action ID if required:

```text
Cellar  -2
Kitchen +2
```

The UI may expose this as one "Move" action.

---

# 6. Purchased-but-unsorted stock

## 6.1 purchased_stock

Represents physical stock that has been purchased but has not yet been assigned to inventory locations.

This is intentionally separate from normal inventory.

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| household_id | uuid | FK households.id, NOT NULL |
| product_id | uuid | FK products.id, NOT NULL |
| quantity | integer | NOT NULL, > 0 |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |

### Example

Shopping:

```text
Tomato Sauce x4
status: PURCHASED
```

After arriving home:

```text
purchased_stock:
Tomato Sauce x4
```

User puts away:

```text
Kitchen +2
Cellar +2
```

Then:

```text
purchased_stock:
Tomato Sauce x0
```

The purchased stock should be removed or reduced once fully stored.

### Consuming before storage

The application must support:

```text
Purchased x4
Consume x1
Remaining to store x3
```

This can be represented by a negative inventory/purchased-stock operation in the sync model, rather than silently losing the quantity.

The exact operation model should be finalized in `SYNC.md`.

---

# 7. Shopping

## 7.1 shopping_items

Shared household shopping list.

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| household_id | uuid | FK households.id, NOT NULL |
| product_id | uuid | FK products.id, NULL |
| free_text | text | NULL |
| quantity | integer | NOT NULL, > 0 |
| status | text | NOT NULL |
| created_by | uuid | FK auth.users.id, NOT NULL |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |
| purchased_at | timestamptz | NULL |
| purchased_by | uuid | FK auth.users.id, NULL |

### Product vs free-text

A shopping item can be:

```text
product_id = existing product
```

or:

```text
free_text = "Birthday candles"
```

but not both.

Database check:

```text
exactly one of product_id and free_text must be populated
```

### Status

V1 states:

```text
PENDING
PURCHASED
STORED
```

Potential future state:

```text
CANCELLED
```

### Product consolidation

Product-based shopping items should consolidate.

Example:

```text
Martin adds Tomato Sauce x2
Caroline adds Tomato Sauce x3
```

Result:

```text
Tomato Sauce x5
```

The database design should permit deterministic consolidation.

This is particularly important for offline creation, so the exact merge/idempotency strategy belongs in `SYNC.md`.

Free-text items should not automatically consolidate unless an exact future rule is introduced.

---

# 8. Sync support

## 8.1 Client-side only: pending_operations

This table is local to IndexedDB/Dexie and does not belong in PostgreSQL.

Suggested local structure:

```text
pending_operations
- operation_id
- type
- payload
- created_at
- retry_count
- last_error
```

The client creates the local operation first, updates its local state immediately, then queues the operation for synchronization.

The server-side `inventory_operations.operation_id` provides idempotency.

A similar pattern should be used for shopping mutations.

---

# 9. Relationships

Conceptually:

```text
households
    │
    ├── household_members
    │
    ├── categories
    │
    ├── locations
    │
    ├── products
    │     │
    │     ├── inventory_lots
    │     │       │
    │     │       └── inventory_operations
    │     │
    │     └── shopping_items
    │
    └── purchased_stock
```

Users are Supabase Auth users referenced by `user_id`.

---

# 10. Indexes

At minimum, create indexes for the common application queries.

Recommended:

```text
products:
  (household_id, is_active)
  (household_id, category_id)

locations:
  (household_id, is_active)

categories:
  (household_id, is_active)

inventory_lots:
  (household_id, product_id)
  (household_id, location_id)
  (household_id, product_id, location_id)
  (household_id, expiration_date)

inventory_operations:
  UNIQUE(operation_id)
  (household_id, created_at)
  (product_id, location_id, created_at)

shopping_items:
  (household_id, status)
  (household_id, product_id, status)

purchased_stock:
  (household_id, product_id)
```

Indexes should be validated against actual query patterns once implementation begins.

---

# 11. Referential integrity

Use foreign keys wherever practical.

Important references:

```text
household_members.household_id → households.id
household_members.user_id → auth.users.id

categories.household_id → households.id
locations.household_id → households.id
products.household_id → households.id

products.category_id → categories.id

inventory_lots.product_id → products.id
inventory_lots.location_id → locations.id

inventory_operations.product_id → products.id
inventory_operations.location_id → locations.id
inventory_operations.inventory_lot_id → inventory_lots.id
inventory_operations.user_id → auth.users.id

shopping_items.product_id → products.id
shopping_items.created_by → auth.users.id
shopping_items.purchased_by → auth.users.id

purchased_stock.product_id → products.id
```

For household-owned records, application logic and RLS must ensure that referenced records belong to the same household.

---

# 12. RLS requirements

RLS is mandatory for all exposed household data.

The fundamental rule is:

> A user may access a row only when the user is a member of that row's household.

Conceptually:

```text
auth.uid()
    ↓
household_members
    ↓
household_id
    ↓
domain row.household_id
```

Policies must cover at least:

- SELECT
- INSERT
- UPDATE
- DELETE

where the operation is applicable.

Do not rely on the frontend to enforce household isolation.

Service-role credentials must never be shipped to the browser.

Detailed RLS policy definitions should be written alongside the migration implementation.

---

# 13. Timestamps

Use:

```text
timestamptz
```

for timestamps.

Use UTC at the database layer.

The UI converts timestamps to the user's local timezone.

Expiration dates use:

```text
date
```

because an expiration date does not need a time-of-day.

---

# 14. Validation rules

Database constraints should enforce basic invariants.

Examples:

```text
quantity >= 0
minimum_stock >= 0
shopping quantity > 0
inventory delta != 0
status is one of the supported values
product/free_text exactly one populated for shopping items
```

Business rules that depend on multiple rows should be handled transactionally in the backend/database rather than trusted to the UI.

---

# 15. What is deliberately NOT modeled yet

Do not add tables for:

- product photos
- receipts
- meal plans
- recipes
- statistics
- costs
- stores
- voice input
- AI features
- multiple households UI
- complex roles
- barcode history
- external product databases
- detailed user activity feeds

These may be added later if requirements change.

---

# 16. Implementation notes

The initial PostgreSQL migration should create the schema in dependency order:

1. households
2. household_members
3. categories
4. locations
5. products
6. inventory_lots
7. inventory_operations
8. purchased_stock
9. shopping_items
10. indexes
11. constraints
12. RLS policies
13. seed categories/locations during household creation

Do not start implementing UI inventory screens until this model and the synchronization rules in `SYNC.md` are finalized.

---

# 17. Open implementation decisions for SYNC.md

The database model is intentionally designed to support the following, but the exact mechanics must be specified next:

1. How Dexie tables mirror the server model.
2. How local mutations generate operations.
3. How operations are uploaded.
4. How server idempotency works.
5. How remote changes are pulled.
6. How realtime events interact with the operation queue.
7. How offline-created shopping items are consolidated.
8. How purchased stock is moved into inventory.
9. How inventory lots are selected/merged.
10. How failed operations are retried.
11. How conflicts are surfaced or resolved.
12. How initial synchronization works on a new device.

`SYNC.md` must resolve these points before Cursor implements the sync layer.
