# Household Organizer — Implementation Roadmap

Version: 1.0
Status: Implementation plan
Project: Household Organizer

## 1. Purpose

This roadmap converts the product, database, synchronization, architecture and UI specifications into small implementation slices.

The goal is to let Cursor implement the application incrementally without making large architectural jumps.

Each slice should:

- have one clear objective
- touch only the necessary parts of the project
- be independently verifiable
- leave the repository in a working state
- avoid speculative features
- avoid unrelated refactoring

---

# 2. Source of truth

Before implementation, Cursor should treat these documents as the project specification:

```text
docs/PRODUCT.md
docs/DATABASE.md
docs/SYNC.md
docs/ARCHITECTURE.md
docs/UI.md
docs/ROADMAP.md
```

If implementation conflicts with one of these documents, stop and resolve the conflict rather than silently changing the architecture.

---

# 3. Development loop

Every implementation slice follows:

```text
1. Read relevant specification
2. Inspect existing repository
3. Implement only the requested scope
4. Add/update relevant tests
5. Run typecheck
6. Run lint
7. Run relevant tests
8. Run production build when appropriate
9. Manually verify the affected workflow
10. Report exactly what changed
```

Do not wait until the end of the project to test.

---

# 4. Phase overview

```text
Phase 0   Project specification
Phase 1   Repository foundation
Phase 2   Database foundation
Phase 3   Authentication + household
Phase 4   Local database / offline foundation
Phase 5   Synchronization engine
Phase 6   UI foundation
Phase 7   Product / category / location management
Phase 8   Inventory
Phase 9   Shopping
Phase 10  Low stock + expiration
Phase 11  PWA + notifications
Phase 12  Barcode scanning
Phase 13  Quality + production hardening
```

---

# 5. Phase 0 — Project specification

## Goal

Have the product and technical decisions documented before application code begins.

### Already completed

```text
PRODUCT / Blueprint
DATABASE.md
SYNC.md
ARCHITECTURE.md
UI.md
ROADMAP.md
```

### Output

A stable specification that Cursor can follow.

---

# 6. Phase 1 — Repository foundation

## CURSOR-001 — Initialize Next.js application

### Objective

Create the basic Next.js project using:

- TypeScript
- App Router
- Tailwind CSS
- ESLint
- `src/` directory

### Acceptance criteria

- project starts locally
- TypeScript works
- Tailwind works
- lint works
- production build works
- no unnecessary dependencies
- README contains basic development instructions

---

## CURSOR-002 — Configure project structure

### Objective

Create the agreed application folder structure.

```text
src/app
src/components
src/features
src/lib/db
src/lib/domain
src/lib/sync
src/lib/supabase
src/lib/utils
supabase/migrations
docs
```

### Acceptance criteria

- directories exist where appropriate
- no speculative files
- project still builds

---

## CURSOR-003 — Configure Supabase clients

### Objective

Create browser/server Supabase client boundaries.

### Acceptance criteria

- environment variables documented
- browser client works
- server client works
- no privileged credentials exposed to browser
- authentication helper boundary exists
- project builds

---

# 7. Phase 2 — Database foundation

## CURSOR-004 — Create initial database migration

### Objective

Implement the PostgreSQL schema from `DATABASE.md`.

Create:

```text
households
household_members
categories
locations
products
inventory_lots
inventory_operations
purchased_stock
shopping_items
```

### Acceptance criteria

- foreign keys exist
- required constraints exist
- quantity constraints exist
- timestamps use appropriate types
- operation IDs are unique
- product/free-text shopping validation exists
- migration applies successfully

Do not build application UI yet.

---

## CURSOR-005 — Create database indexes and archive support

### Objective

Add the indexes and active/archive behavior specified in `DATABASE.md`.

### Acceptance criteria

- common query indexes exist
- products/categories/locations support archiving
- referenced records are not hard-deleted accidentally
- migration applies cleanly

---

## CURSOR-006 — Implement RLS

### Objective

Protect all household-owned data with Supabase RLS.

### Acceptance criteria

- authenticated household members can access their household
- users cannot access another household
- unauthorized inserts/updates/deletes fail
- anonymous access is denied
- policies are tested

Do not continue until RLS behavior is verified.

---

# 8. Phase 3 — Authentication + household

## CURSOR-007 — Authentication screens

### Objective

Implement:

```text
Login
Sign up
Logout
```

### Acceptance criteria

- user can create account
- user can log in
- session persists
- logout works
- unauthenticated users cannot access the household application

---

## CURSOR-008 — Household bootstrap

### Objective

Implement automatic household creation for a new first user.

### Acceptance criteria

- first user can create a household
- categories are seeded
- locations are seeded
- user becomes household member
- duplicate household creation is prevented

---

## CURSOR-009 — Household joining

### Objective

Allow the second user to join using the household join code.

### Acceptance criteria

- valid join code works
- invalid code fails
- user becomes a household member
- user can access shared household data
- cross-household access remains blocked

---

# 9. Phase 4 — Local database / offline foundation

This phase happens before the main inventory/shopping screens.

## CURSOR-010 — Install and configure Dexie

### Objective

Create the local IndexedDB database.

Tables:

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

### Acceptance criteria

- Dexie database opens
- schema versioning is configured
- database survives reload
- local records can be inserted/read
- browser-only code is not executed during SSR

---

## CURSOR-011 — Local repositories

### Objective

Create explicit repositories for local data access.

Examples:

```text
ProductRepository
InventoryRepository
ShoppingRepository
```

### Acceptance criteria

- feature code does not directly access Dexie
- repositories expose clear operations
- no generic repository framework
- tests cover basic CRUD/read behavior

---

## CURSOR-012 — Local domain rules

### Objective

Implement pure domain functions.

At minimum:

```text
calculateCurrentStock()
isLowStock()
getSuggestedShoppingQuantity()
selectLotsForConsumption()
validateShoppingTransition()
```

### Acceptance criteria

- no React dependencies
- no Supabase dependencies
- deterministic tests
- edge cases covered

---

# 10. Phase 5 — Synchronization engine

This is the most technically important phase.

## CURSOR-013 — Operation/outbox model

### Objective

Implement local pending operations.

### Acceptance criteria

- every syncable mutation receives a UUID
- operation survives browser restart
- pending operations can be listed
- operation state can be updated
- duplicate operation IDs are handled safely

---

## CURSOR-014 — Inventory delta operations

### Objective

Implement local inventory mutations using deltas.

### Acceptance criteria

- add creates positive delta
- remove creates negative delta
- UI/local inventory updates immediately
- absolute quantity is not used as sync mutation
- operations are queued

---

## CURSOR-015 — Server idempotency

### Objective

Implement server-side handling for inventory operation IDs.

### Acceptance criteria

Given the same operation twice:

```text
operation X
operation X
```

the inventory changes exactly once.

This must be verified with an automated test.

---

## CURSOR-016 — Transactional inventory commands

### Objective

Implement server-side transactional functions for:

```text
remove inventory
move inventory
```

### Acceptance criteria

- invalid removals are rejected
- inventory cannot become negative
- moves update both source and destination atomically
- corresponding operation records are created
- retry is idempotent

---

## CURSOR-017 — Sync uploader

### Objective

Process the local outbox when online.

### Acceptance criteria

- queued operations upload
- successful operations leave the queue
- temporary failures remain queued
- retries use the same operation ID
- retry backoff exists
- browser restart does not lose the queue

---

## CURSOR-018 — Initial synchronization

### Objective

Populate Dexie from the server after authentication.

### Acceptance criteria

- new device receives household data
- local database is populated
- sync metadata is stored
- different household data cannot leak into the local DB
- initial sync completes before normal synced state is assumed

---

## CURSOR-019 — Remote reconciliation

### Objective

Apply server-side changes to Dexie.

### Acceptance criteria

- remote changes appear locally
- local pending operations are preserved
- reconciliation can recover from missed realtime events
- full refresh/recovery mechanism exists

---

## CURSOR-020 — Realtime synchronization

### Objective

Connect Supabase Realtime to the sync layer.

### Acceptance criteria

- changes from another device eventually appear
- realtime events do not duplicate local operations
- subscription lifecycle is centrally managed
- missed events can be recovered through reconciliation

---

## CURSOR-021 — Sync rejection handling

### Objective

Handle business-level server rejection.

### Acceptance criteria

- network errors retry
- business errors do not retry forever
- rejected local state is reconciled
- user receives actionable feedback
- failed operation remains diagnosable

---

# 11. Phase 6 — UI foundation

## CURSOR-022 — Application shell

### Objective

Implement the global layout and mobile navigation.

Routes:

```text
/
 /inventory
 /shopping
 /settings
```

### Acceptance criteria

- mobile bottom navigation works
- active route is clear
- authenticated/unauthenticated layouts are separated
- responsive desktop behavior exists
- no feature-specific functionality yet

---

## CURSOR-023 — Base UI components

### Objective

Create only the reusable components needed immediately.

Examples:

```text
Button
Input
Select
Modal/Sheet
Badge
Card
ListItem
QuantityControl
EmptyState
```

### Acceptance criteria

- consistent Tailwind styling
- accessible controls
- no unnecessary design-system abstraction
- components are actually used by the shell or next feature

---

## CURSOR-024 — Offline/sync status

### Objective

Add the global sync state indicator.

States:

```text
Online
Offline
Syncing
Needs attention
```

### Acceptance criteria

- status is understandable
- offline does not block core UI
- pending count can be surfaced
- technical errors are not dumped into the interface

---

# 12. Phase 7 — Product / category / location management

## CURSOR-025 — Product creation/editing

### Objective

Implement product CRUD/archive.

Fields:

```text
Name
Category
Minimum stock
```

### Acceptance criteria

- create product
- edit product
- archive product
- prevent duplicate names within household
- search works
- archived products are excluded from new selectors

---

## CURSOR-026 — Category management

### Objective

Implement editable categories.

### Acceptance criteria

- list categories
- create
- rename
- archive
- referenced categories remain valid

---

## CURSOR-027 — Location management

### Objective

Implement editable locations.

### Acceptance criteria

- list locations
- create
- rename
- reorder
- archive
- existing inventory references remain valid

---

# 13. Phase 8 — Inventory

## CURSOR-028 — Inventory list

### Objective

Implement the main inventory screen.

### Acceptance criteria

- local data source
- product search
- category filter
- location filter
- total quantity
- location quantities
- zero-stock products appear when searched
- mobile-first layout

---

## CURSOR-029 — Add inventory

### Objective

Implement the complete add-stock workflow.

```text
Product
→ Quantity
→ Location
→ Optional expiration
→ Add
```

### Acceptance criteria

- works offline
- creates/updates inventory lot
- creates inventory delta
- updates UI immediately
- syncs later

---

## CURSOR-030 — Quantity controls

### Objective

Implement fast +/- controls.

### Acceptance criteria

- remove one
- add one
- immediate local update
- cannot silently produce negative stock
- correct location is selected
- controls are accessible

---

## CURSOR-031 — Product detail

### Objective

Implement product detail.

Show:

```text
total stock
location stock
expiration information
minimum stock
```

Actions:

```text
add stock
remove
move
add to shopping
```

---

## CURSOR-032 — Inventory lot consumption

### Objective

Implement deterministic lot selection.

### Acceptance criteria

- earliest-expiring applicable lot is consumed first
- multiple lots can be consumed
- no negative lot quantities
- no expiration information is lost
- tests cover multiple-lot scenarios

---

## CURSOR-033 — Move inventory

### Objective

Implement location-to-location movement.

### Acceptance criteria

- source decreases
- destination increases
- atomic server operation
- offline support
- retry safe

---

# 14. Phase 9 — Shopping

## CURSOR-034 — Shopping list

### Objective

Implement shared shopping list.

### Acceptance criteria

- product items
- free-text items
- quantity controls
- remove
- offline support
- search existing products

---

## CURSOR-035 — Offline shopping creation

### Objective

Ensure shopping creation is stable offline.

### Acceptance criteria

- stable client ID
- survives restart
- syncs once
- no duplicate after retry

---

## CURSOR-036 — Product shopping consolidation

### Objective

Implement shared product-based quantity consolidation.

### Acceptance criteria

Scenario:

```text
Martin offline: +2 Tomato Sauce
Caroline offline: +3 Tomato Sauce
```

Result:

```text
Tomato Sauce: 5
```

No quantity is lost.

---

## CURSOR-037 — Purchase state

### Objective

Implement:

```text
PENDING → PURCHASED
```

### Acceptance criteria

- quick purchase action
- offline support
- quantity preserved
- inventory does not change immediately

---

## CURSOR-038 — Purchased stock

### Objective

Create purchased-but-unsorted workflow.

### Acceptance criteria

- purchased quantity appears separately
- inventory remains unchanged until put-away
- purchased stock survives offline/restart
- partial put-away is possible

---

## CURSOR-039 — Put away purchased stock

### Objective

Implement allocation of purchased stock to locations.

Example:

```text
Purchased 4

Kitchen 2
Cellar 2
```

### Acceptance criteria

- purchased quantity decreases
- inventory increases
- shopping item becomes STORED when fully allocated
- partial allocation leaves remaining purchased stock
- operation is atomic and retry safe

---

## CURSOR-040 — Consume purchased stock before storage

### Objective

Support immediate consumption.

Example:

```text
Purchased 4
Consumed 1
Remaining 3
```

### Acceptance criteria

- quantity remains consistent
- no phantom inventory is created
- sync remains idempotent

---

# 15. Phase 10 — Low stock + expiration

## CURSOR-041 — Low-stock calculation

### Objective

Show low-stock products.

### Acceptance criteria

```text
current stock < minimum stock
```

is correctly detected.

---

## CURSOR-042 — Shopping suggestion

### Objective

Offer:

```text
Add X to shopping list?
```

where:

```text
X = minimum stock - current stock
```

### Acceptance criteria

- never automatically adds items
- correct suggested quantity
- existing shopping quantity is handled correctly
- works offline

---

## CURSOR-043 — Expiration indicators

### Objective

Add expiration visibility and warning states.

### Acceptance criteria

- optional expiration
- nearest expiration shown
- expired state
- expiring-soon state
- no placeholder for undated stock
- multiple lots handled correctly

---

## CURSOR-044 — Home dashboard

### Objective

Implement the useful Home overview.

Include:

```text
Add item
Low stock
Expiring soon
Purchased waiting to be stored
Quick locations
```

### Acceptance criteria

- information comes from local data
- works offline
- no unnecessary dashboard metrics

---

# 16. Phase 11 — PWA + notifications

## CURSOR-045 — PWA foundation

### Objective

Make the application installable.

### Acceptance criteria

- valid manifest
- app icons
- standalone mode
- service worker
- appropriate asset caching
- core application remains functional offline

---

## CURSOR-046 — Push notification foundation

### Objective

Implement notification registration.

Potential notifications:

```text
low stock
expiration
purchased items waiting to be stored
```

### Acceptance criteria

- registration is explicit
- permission state is handled
- notifications do not block core app functionality
- registration works independently of inventory sync

---

## CURSOR-047 — Notification preferences

### Objective

Add basic notification controls.

### Acceptance criteria

- user can enable/disable notification categories
- preferences persist
- disabled notifications are not sent
- no complex scheduling UI

---

# 17. Phase 12 — Barcode scanning

## CURSOR-048 — Barcode scanner

### Objective

Add camera-based barcode scanning.

### Flow

```text
Add item
→ Scan barcode
→ Product found?
   → Existing product
   → Create product
```

### Acceptance criteria

- manual entry remains available
- scanner works on supported mobile browsers
- barcode stored against product
- scanning does not require internet for recognizing the barcode itself

---

## CURSOR-049 — External product lookup

### Objective

Optionally enrich an unknown barcode using an external product database.

### Acceptance criteria

- external service failure does not block manual creation
- external data is treated as untrusted input
- user confirms product information before saving
- API credentials remain server-side where required

---

# 18. Phase 13 — Quality + production hardening

User-ticket CURSOR-043 is this hardening pass (roadmap tickets 050–055).

## CURSOR-050 — Automated test coverage

### Objective

Ensure critical domain and sync scenarios are covered.

Required:

```text
inventory deltas
concurrent changes
idempotency
shopping consolidation
put-away
lot selection
RLS
offline queue
reconnect
```

---

## CURSOR-051 — End-to-end workflows

### Objective

Test the primary user journeys.

```text
login
create household
join household
add inventory
consume inventory
shopping
purchase
put away
low stock
expiration
```

---

## CURSOR-052 — Two-device concurrency testing

### Objective

Validate the real household use case.

Test:

```text
Martin device
Caroline device
```

with:

- simultaneous inventory changes
- simultaneous shopping changes
- offline periods
- reconnect in different orders

### Acceptance criteria

Both devices converge on the same correct state.

---

## CURSOR-053 — Mobile/PWA QA

### Objective

Test supported mobile browsers and installed PWA behavior.

Verify:

- offline
- reconnect
- browser restart
- touch interactions
- keyboard/input behavior
- notification permissions
- viewport behavior

---

## CURSOR-054 — Security audit

### Objective

Review:

- RLS
- authentication
- household isolation
- client/server credential boundaries
- server functions
- input validation

### Acceptance criteria

No household data can be accessed through client-side manipulation of IDs.

---

## CURSOR-055 — Production readiness

### Objective

Prepare production deployment.

Verify:

- Vercel deployment
- Supabase production configuration
- environment variables
- migrations
- build
- error handling
- basic monitoring/logging
- backups/recovery assumptions

---

# 19. Explicitly out of scope for V1

Do not create implementation slices for:

```text
product photos
receipt scanning
voice input
AI features
meal planning
recipes
cost tracking
statistics
store-specific lists
social login
multiple-household UI
complex roles
activity feed
```

These should not sneak into unrelated Cursor tasks.

---

# 20. Future backlog

After V1:

```text
barcode enrichment improvements
better notification controls
inventory history UI
undo actions
advanced sync diagnostics
better batch/lot management
product photos
receipt scanning
statistics
cost tracking
meal planning
AI features
```

Future work should be evaluated against actual usage rather than implemented speculatively.

---

# 21. Cursor task rules

Every Cursor prompt should explicitly tell Cursor:

```text
Read the relevant docs first.

Do not change architecture without approval.

Do not modify unrelated files.

Do not add dependencies unless required.

Do not implement future features.

Keep the implementation small.

Add tests for the behavior introduced.

Run typecheck.

Run lint.

Run relevant tests.

Run build when appropriate.

Report files changed and verification results.
```

Cursor should ask for clarification instead of making a major architectural assumption when the specification is genuinely ambiguous.

---

# 22. Recommended first implementation sequence

Once the repository is ready, execute:

```text
CURSOR-001
CURSOR-002
CURSOR-003

CURSOR-004
CURSOR-005
CURSOR-006

CURSOR-007
CURSOR-008
CURSOR-009

CURSOR-010
CURSOR-011
CURSOR-012

CURSOR-013
...
```

Do not jump directly to the inventory UI.

The offline/synchronization foundation is deliberately implemented before the feature screens so that inventory and shopping are built on the correct data model from the beginning.

---

# 23. Definition of V1 complete

V1 is complete when two household users can:

```text
sign in
    ↓
share one household
    ↓
create/manage products
    ↓
track stock by location
    ↓
add/remove/move stock
    ↓
work offline
    ↓
sync safely
    ↓
manage shared shopping
    ↓
mark purchases
    ↓
put purchases away
    ↓
handle expiration
    ↓
see low-stock suggestions
    ↓
use the application as an installable PWA
```

The critical requirement is that the two users can use their phones independently, including while offline, and eventually converge on the correct shared household state.
