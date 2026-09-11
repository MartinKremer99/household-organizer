# Household Organizer — Synchronization Specification

Version: 1.0
Status: Implementation-ready specification
Local database: Dexie + IndexedDB
Server database: PostgreSQL via Supabase

## 1. Purpose

Household Organizer must work when a device has no internet connection, especially when stock is being managed in the cellar.

The synchronization system must therefore provide:

- immediate local updates
- offline reads and writes for core inventory/shopping workflows
- reliable upload after reconnect
- idempotent retries
- safe concurrent changes from two devices
- realtime propagation of remote changes
- deterministic conflict behavior
- no dependency on a continuously available network

The application is not intended to become a generic distributed database. Offline support is limited to the core household workflows.

---

# 2. Architecture

```text
                    ┌──────────────────────┐
                    │      Next.js UI      │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Application/Data API │
                    └──────────┬───────────┘
                               │
                ┌──────────────┴──────────────┐
                │                             │
                ▼                             ▼
      ┌──────────────────┐          ┌──────────────────┐
      │ Dexie / IndexedDB│          │ Supabase Client  │
      │ Local source     │          │ Network layer    │
      └────────┬─────────┘          └────────┬─────────┘
               │                             │
               │                             ▼
               │                    ┌──────────────────┐
               │                    │ Supabase/Postgres │
               │                    └──────────────────┘
               │
               ▼
      ┌──────────────────┐
      │ Pending operations│
      │ / outbox         │
      └──────────────────┘
```

The UI should normally read from the local database rather than directly from Supabase.

Supabase is the shared durable server state.

Dexie is the local working state.

---

# 3. Offline scope

## 3.1 Must work offline

The following workflows must work without network access:

### Inventory

- view inventory
- search products
- filter by category/location/status
- add stock
- remove stock
- move stock
- put away purchased stock
- consume purchased-but-unsorted stock
- view expiration information

### Shopping

- view shopping list
- add product to shopping
- add free-text shopping item
- change quantity
- remove shopping item
- mark item purchased
- manage purchased-but-unsorted stock

## 3.2 May require connectivity initially

The following can remain online-only in V1:

- account creation
- joining a household
- household bootstrap
- initial authentication
- external barcode/product-database lookup
- future external integrations

Open Food Facts lookup is online-only and is not queued. Catalog commands and household rename use the same outbox/RPC path as inventory and shopping.

Once authenticated and synchronized, the core household workflows should remain usable offline.

---

# 4. Local database

Use Dexie over IndexedDB.

The local database should contain at least:

```text
products
categories
locations
inventory_lots
inventory_operations
purchased_stock
shopping_items
pending_operations
sync_metadata
```

The local representation should be close enough to the server model that server changes can be applied deterministically.

The local database is not a temporary cache. It is the working data store for the application.

---

# 5. Local-first mutation model

Every offline-capable mutation follows this pattern:

```text
1. User performs action
2. Validate action locally
3. Generate operation_id
4. Update local database immediately
5. Add operation to pending_operations
6. UI updates immediately
7. If online, attempt upload
8. If upload fails, retain operation
9. Retry after reconnect
```

The user must not have to wait for Supabase before seeing the result of a valid local action.

Example:

```text
User taps "-" on Tomato Sauce in cellar.

Local:
Cellar 4 → 3

Pending operation:
REMOVE -1
operation_id = X

UI immediately shows:
Cellar 3
```

If the network is unavailable, nothing else is required from the user.

---

# 6. Operation identity

Every mutation that must be synchronized receives a unique client-generated `operation_id`.

Use UUIDs.

Example:

```text
operation_id:
550e8400-e29b-41d4-a716-446655440000
```

The same operation ID must never be generated again for a different operation.

The server stores the operation ID for inventory operations.

If the client sends:

```text
operation_id = X
delta = -1
```

and the request times out after the server successfully processes it, the client may retry:

```text
operation_id = X
delta = -1
```

The server must recognize that X was already processed and must not apply the delta a second time.

This is the central retry/idempotency rule.

---

# 7. Inventory synchronization

## 7.1 Never synchronize absolute quantity as the mutation

Do not send:

```text
quantity = 3
```

as the authoritative inventory mutation.

Send:

```text
delta = -1
```

instead.

This prevents this failure:

```text
Initial: 4

Martin offline:
4 → 3

Caroline offline:
4 → 3

Both sync

Naive last-write-wins:
3

Correct delta result:
2
```

## 7.2 Inventory operation

Conceptual local operation:

```text
{
  operationId,
  type: "INVENTORY_DELTA",
  productId,
  locationId,
  inventoryLotId,
  delta,
  operationType,
  createdAt
}
```

The exact TypeScript type should be defined once in the application domain layer and reused by the local database and sync engine.

---

# 8. Inventory lot handling

Expiration dates belong to inventory lots.

When adding stock:

- if the user specifies an expiration date, use/create a compatible lot
- if no expiration date is specified, use/create an undated lot where appropriate

When consuming stock:

1. select stock in the requested location
2. prefer the lot with the earliest expiration date
3. among equally applicable lots, use deterministic ordering
4. consume only the requested amount
5. if multiple lots are required, consume from multiple lots

Example:

```text
Kitchen:

Lot A: 2, expires Jan 2027
Lot B: 3, expires Jun 2027

User consumes 3.

Result:

Lot A: 0
Lot B: 2
```

The UI can present this simply as:

```text
Kitchen: 2
```

---

# 9. Moving inventory

A move is logically one user action but can produce two inventory deltas.

Example:

```text
Move 2 Tomato Sauce:

Cellar:
-2

Kitchen:
+2
```

The two operations should share a logical action identifier if useful for UI/history/debugging.

Each individual operation still needs its own unique `operation_id`.

The system must ensure that a retry cannot duplicate either side.

A move should be applied transactionally where the server operation API supports it.

If transactional server handling is used, prefer one server-side command that creates both inventory operations atomically.

---

# 10. Preventing invalid inventory

The system must not allow inventory to become negative.

This is more difficult offline because the local device may have stale information.

Example:

```text
Server stock = 1

Martin offline sees 1
Caroline offline sees 1

Martin removes 1
Caroline removes 1
```

The deltas sum to `-2`, while only `1` existed.

This is a genuine concurrent business conflict.

V1 rule:

- local UI may optimistically apply the operation
- synchronization must validate the resulting server state
- the server must reject an operation that would make stock negative
- the client must reconcile the rejected operation and inform the user

Do not silently discard a rejected removal.

The exact reconciliation UI should be implemented in the application layer.

For a simple household app, this is preferable to silently allowing negative stock.

---

# 11. Shopping synchronization

Shopping mutations are state-based rather than inventory-delta based.

Each shopping item has a stable ID.

Example:

```text
shopping_item_id = X
status = PENDING
quantity = 3
```

Changes to that item should carry the item ID and the intended mutation.

The client should never identify a shopping item solely by its display text.

---

# 12. Offline shopping creation

When a product is added to shopping offline:

```text
1. Create stable shopping item ID locally
2. Add item to local shopping list
3. Queue creation operation
4. Sync later
```

The server must preserve the same ID.

If the request is retried, the same ID must be used.

This prevents duplicate shopping items caused by network retries.

---

# 13. Shopping consolidation

Product-based shopping items should normally consolidate.

Example:

```text
Martin:
Tomato Sauce x2

Caroline:
Tomato Sauce x3
```

Desired logical result:

```text
Tomato Sauce x5
```

However, this must not rely on:

```text
SELECT existing item → update quantity
```

because both devices can perform that operation while offline.

The sync layer should instead use deterministic product-based aggregation or atomic server-side increments.

Recommended approach:

- each client creates a stable shopping intent/line ID
- synchronization preserves individual intents
- active shopping quantity is derived as the sum of active product intents

This avoids a lost-update race.

The UI may display the intents as one consolidated line.

If later implementation complexity proves unnecessary for this small application, a server-side atomic increment can be used, but it must still be idempotent.

---

# 14. Free-text shopping items

Free-text shopping items are independent items.

Example:

```text
Birthday candles
```

They:

- do not create inventory
- do not require a product
- can be purchased/completed
- can be removed
- should not automatically merge with another text item

The stable shopping item ID remains the identity.

---

# 15. Shopping state transitions

Normal state flow:

```text
PENDING
   │
   ▼
PURCHASED
   │
   ▼
STORED
```

Marking something `PURCHASED` does not increase inventory.

The purchased quantity becomes available as purchased-but-unsorted stock.

Example:

```text
Shopping:
Tomato Sauce x4
→ PURCHASED

Purchased stock:
Tomato Sauce x4

Inventory:
unchanged
```

Then:

```text
Put away:

Kitchen +2
Cellar +2
```

After the full quantity has been stored:

```text
Purchased stock:
0

Shopping:
STORED
```

---

# 16. Purchased stock synchronization

Purchased-but-unsorted stock is shared state.

It must therefore use stable IDs and idempotent mutations just like inventory and shopping.

Example:

```text
PURCHASE:
Tomato Sauce +4 purchased stock

PUT_AWAY:
Kitchen +2
Cellar +2
Purchased stock -4
```

The put-away action should be represented as one logical operation that updates the purchased pool and inventory atomically on the server where practical.

This prevents a partial server state such as:

```text
Inventory +4
Purchased stock still +4
```

after a retry or partial failure.

---

# 17. Realtime synchronization

Realtime is used to reduce the delay between one device changing shared data and the other device seeing it.

Conceptually:

```text
Martin device
    ↓
Supabase
    ↓
Realtime event
    ↓
Caroline device
    ↓
Dexie
    ↓
UI
```

Realtime is not the source of truth.

The server database remains authoritative.

If a realtime event is missed, the application must still be able to recover through synchronization.

Do not design the system so that correctness depends on receiving every realtime event.

---

# 18. Reconciliation

The sync engine must support a reconciliation operation.

A reconciliation should:

1. identify the household
2. determine the last known synchronization point
3. fetch changes since that point
4. apply remote changes to Dexie
5. reconcile pending local operations
6. update sync metadata

If there is uncertainty about synchronization state, the client should be able to perform a full refresh of the household data.

The full refresh is a recovery mechanism, not the normal sync path.

---

# 19. Sync cursor / checkpoint

The local database should maintain synchronization metadata.

Example:

```text
sync_metadata
- household_id
- last_sync_at
- last_server_cursor
- schema_version
```

If a reliable server-side change cursor is used, prefer it over relying only on timestamps.

Timestamps alone can produce boundary problems when multiple records share close timestamps.

The exact cursor mechanism should be selected during implementation based on the Supabase synchronization API chosen.

---

# 20. Upload queue

`pending_operations` is an outbox.

Each item should contain enough information to retry safely.

Suggested structure:

```text
id
operation_id
operation_type
payload
created_at
retry_count
last_attempt_at
last_error
```

The queue should process operations in a deterministic order.

Prefer FIFO for normal processing.

An individual failed operation must not permanently block unrelated operations unless ordering is required for correctness.

---

# 21. Retry behavior

When online:

```text
process queue
    ↓
send operation
    ↓
success?
 ┌──┴──┐
yes   no
 │     │
remove retry later
```

Retry with backoff.

Do not continuously hammer Supabase while offline.

The browser's online/offline events can trigger an immediate retry, but they should not be treated as proof that the network request will succeed.

A failed request remains queued. Failed outbox rows stay failed; there is no retry/discard UI. The user retries the action.

---

# 22. Handling server rejection

Not every failed request is a network failure.

Distinguish:

### Network failure

Examples:

- offline
- DNS failure
- timeout
- temporary server error

Action:

```text
keep operation queued
retry
```

### Business rejection

Examples:

- removing more stock than exists
- invalid state transition
- archived/deleted referenced entity
- authorization failure

Action:

```text
mark operation as rejected
reconcile local state
show actionable error
do not blindly retry forever
```

The client must distinguish these cases.

---

# 23. Optimistic UI

All offline-capable actions are optimistic.

The UI should react immediately.

Example:

```text
Before:
Cellar 4

Tap -
↓
Cellar 3 immediately
```

The user should not see a loading spinner for every quantity change.

A subtle sync status may be shown if useful:

```text
Synced
Syncing
Offline
Needs attention
```

The exact visual design belongs in `UI.md`.

---

# 24. Initial synchronization

After authentication and household membership are established:

```text
1. Create/open Dexie database
2. Determine local household
3. Fetch authoritative server state
4. Populate local database
5. Establish realtime subscription
6. Mark initial sync complete
7. Enable normal offline-first operation
```

Do not allow stale local data from a different household to leak into the current household.

Household ID must be part of local sync state.

---

# 25. New-device synchronization

When a second device signs in:

```text
Supabase
   ↓
initial sync
   ↓
Dexie
   ↓
UI
```

The device should receive:

- products
- categories
- locations
- inventory
- shopping items
- purchased stock
- relevant synchronization metadata

Historical inventory operations do not necessarily need to be downloaded in full for V1 if the server maintains them independently.

The client only needs enough history/cursor state to synchronize correctly.

---

# 26. Realtime + outbox interaction

Avoid this failure pattern:

```text
local mutation
→ local DB
→ upload
→ realtime event
→ apply same mutation again
```

The same operation may therefore appear locally through two paths:

1. the local optimistic update
2. the remote realtime event

The synchronization layer must recognize already-applied operations.

Use `operation_id` or equivalent event identity.

Applying the same operation twice must be harmless.

---

# 27. Sync invariants

These rules must always hold:

### Invariant 1

Every syncable client mutation has a stable unique operation ID.

### Invariant 2

Retrying an operation never applies it twice.

### Invariant 3

The UI can operate on local state without network access for supported workflows.

### Invariant 4

Remote changes eventually appear locally after successful synchronization.

### Invariant 5

Inventory quantity is derived from deltas/operations rather than absolute last-write-wins mutations.

### Invariant 6

A rejected server operation is reconciled rather than silently lost.

### Invariant 7

Realtime improves freshness but is not required for correctness.

### Invariant 8

All synchronized data belongs to the authenticated household.

---

# 28. Security

The browser must never receive a Supabase service-role/secret key.

All server-side authorization must be enforced by Supabase Auth + RLS and, where necessary, server-side transactional functions.

Client-side checks are convenience checks only.

Never trust:

```text
household_id
user_id
product ownership
location ownership
```

provided by the browser without server-side authorization.

---

# 29. What should be implemented as server transactions/functions

Certain operations span multiple records and should be atomic.

Recommended candidates:

### Put away purchased stock

```text
decrease purchased_stock
+
increase inventory
+
create inventory operation(s)
+
update shopping status
```

### Move inventory

```text
decrease source
+
increase destination
+
create corresponding operation records
```

### Validated inventory removal

```text
verify available quantity
+
apply delta
+
record operation
```

The exact Supabase RPC/function implementation should be decided during the database implementation phase.

---

# 30. Sync engine boundaries

The sync engine should expose a small application-facing API.

Conceptually:

```text
inventory.add(...)
inventory.remove(...)
inventory.move(...)

shopping.add(...)
shopping.update(...)
shopping.remove(...)
shopping.markPurchased(...)

purchasedStock.putAway(...)
```

UI components should not directly manipulate:

- IndexedDB
- Supabase queries
- sync queues
- realtime subscriptions

Those concerns belong below the application/domain layer.

---

# 31. Recommended code structure

A possible structure:

```text
src/
  app/
  components/
  features/
    inventory/
    shopping/
    products/
  lib/
    supabase/
    db/
    sync/
    domain/
```

Possible responsibilities:

```text
lib/db/
  Dexie database
  local repositories

lib/sync/
  outbox
  upload
  download/reconciliation
  realtime
  retry handling

lib/domain/
  inventory rules
  shopping rules
  shared types

features/
  user-facing workflows
```

Do not create a large generic repository framework before it is needed.

---

# 32. Testing requirements

Synchronization must be tested before feature development relies heavily on it.

Minimum automated scenarios:

### Inventory

1. Add stock online.
2. Add stock offline, then reconnect.
3. Remove stock offline, then reconnect.
4. Two offline devices remove stock.
5. Duplicate operation submission.
6. Lost response followed by retry.
7. Invalid removal rejected by server.
8. Move between locations.
9. Put away purchased stock.
10. Multiple expiration lots.

### Shopping

11. Add shopping item offline.
12. Update quantity offline.
13. Two users add the same product while offline.
14. Mark purchased offline.
15. Put away after reconnect.
16. Duplicate request.
17. Free-text shopping item.

### Recovery

18. Realtime event missed.
19. Full reconciliation.
20. Browser closed with pending operations.
21. Browser restarted offline.
22. Temporary network failure.
23. Server rejection.
24. User signs in on a second device.

---

# 33. Manual offline acceptance test

Before calling offline support complete:

### Device A

1. Open application online.
2. Let it synchronize.
3. Disable network.
4. Add/remove/move inventory.
5. Modify shopping list.
6. Mark an item purchased.
7. Put away purchased stock.
8. Close/reopen browser while offline.
9. Verify all local changes remain.

### Device B

1. Make independent changes while online/offline.
2. Reconnect both devices.
3. Verify changes converge to the same state.

The final state must be deterministic and must not depend on which device reconnects first.

---

# 34. Implementation order

Implement synchronization in this order:

1. Dexie database setup
2. Local domain types
3. Local repositories
4. Local mutation functions
5. Pending operation/outbox
6. Inventory operation model
7. Server-side idempotency
8. Server transactional operations
9. Upload queue
10. Retry/backoff
11. Initial synchronization
12. Remote change reconciliation
13. Realtime subscription
14. Duplicate-event protection
15. Rejection/reconciliation handling
16. Offline/reconnect testing

Do not build barcode scanning, notifications or advanced UI before the core sync model is working.

---

# 35. Definition of done

The synchronization foundation is complete when:

- the app can read core household data offline
- core inventory mutations work offline
- shopping mutations work offline
- local changes survive browser restart
- pending operations survive browser restart
- reconnect automatically synchronizes changes
- duplicate submissions are idempotent
- two users' independent inventory deltas do not overwrite each other
- server-side invalid operations are rejected safely
- realtime updates reach the other device
- missed realtime events can be recovered
- all data is protected by household-level RLS
- automated sync tests cover the critical scenarios
- TypeScript typecheck passes
- lint passes
- production build passes

Once this document is implemented, `ARCHITECTURE.md` should define the concrete Next.js/Supabase/Dexie code boundaries without changing these synchronization principles.
