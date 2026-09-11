# Household Organizer — Architecture Specification

Version: 1.0
Status: Implementation-ready specification
Stack: Next.js + TypeScript + Tailwind CSS + Supabase + Dexie

## 1. Purpose

This document translates the product, database, and synchronization decisions into a concrete application architecture.

The architecture should optimize for:

- two-person household use
- mobile-first UX
- offline-first core workflows
- simple maintenance
- strong household-level security
- small, understandable code boundaries
- incremental implementation
- minimal infrastructure
- future extensibility without premature abstraction

The application should be a single Next.js application backed by Supabase.

---

# 2. Technology stack

## Frontend

- Next.js
- TypeScript
- React
- App Router
- Tailwind CSS
- Tailwind UI components where appropriate

## Backend/data

- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Row Level Security
- Supabase Realtime
- Supabase server-side functions/RPC where transactional operations are required

## Local/offline

- IndexedDB
- Dexie

## Hosting

- Vercel

## Repository

- GitHub

---

# 3. High-level architecture

```text
┌──────────────────────────────────────────────┐
│                  Next.js App                 │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │              UI / Features             │  │
│  │ Home / Inventory / Shopping / Forms    │  │
│  └───────────────────┬────────────────────┘  │
│                      │                       │
│  ┌───────────────────▼────────────────────┐  │
│  │          Application / Domain          │  │
│  │ Inventory / Shopping / Products        │  │
│  └──────────────┬─────────────┬───────────┘  │
│                 │             │              │
│        ┌────────▼──────┐ ┌────▼───────────┐  │
│        │ Local Data    │ │ Sync Layer     │  │
│        │ Dexie         │ │ Outbox/Realtime│  │
│        └────────┬──────┘ └────┬───────────┘  │
│                 │             │              │
└─────────────────┼─────────────┼──────────────┘
                  │             │
                  │             ▼
                  │     ┌────────────────────┐
                  │     │ Supabase           │
                  │     │ Auth / RLS / RPC   │
                  │     │ Realtime / Postgres │
                  │     └────────────────────┘
                  │
                  └── local-first operation
```

The UI should not directly communicate with PostgreSQL.

The UI should interact with application/domain services.

Those services decide whether to read/write local state, enqueue an operation, or invoke a server transaction.

---

# 4. Core architectural principle

## Local state is the UI's working source

For offline-capable features:

```text
UI
 ↓
Application service
 ↓
Dexie
 ↓
UI reacts to local change
```

Synchronization happens alongside this:

```text
Application service
 ↓
Outbox
 ↓
Supabase
```

Remote changes flow back:

```text
Supabase
 ↓
Realtime / reconciliation
 ↓
Dexie
 ↓
UI
```

This means the UI does not need separate "online UI" and "offline UI".

The same screen operates against local state.

---

# 5. Next.js responsibilities

Next.js provides:

- application routing
- React rendering
- layouts
- server/client boundaries
- authentication integration
- static/server rendering where appropriate
- API/server actions only where they provide a meaningful boundary

The application should avoid unnecessary API routes that merely proxy Supabase queries.

Use Supabase directly from the appropriate client/server boundary when RLS provides the required authorization.

Use server-side functions/RPC for operations that require:

- transactions
- multi-row atomicity
- privileged server logic
- complex validation that should not be trusted to the browser

---

# 6. Server vs client components

Default to server components where they provide value.

Use client components when the feature requires:

- local state
- Dexie access
- browser APIs
- offline behavior
- realtime subscriptions
- interactive forms
- quantity controls
- modals
- navigation interactions

Because the core inventory/shopping experience is offline-first, most interactive feature screens will naturally contain client-side components.

Do not force every component into `"use client"`.

Keep browser-only logic at the lowest practical level.

---

# 7. Suggested project structure

```text
household-organizer/
│
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── login/
│   │   ├── inventory/
│   │   ├── shopping/
│   │   └── settings/
│   │
│   ├── components/
│   │   ├── ui/
│   │   └── layout/
│   │
│   ├── features/
│   │   ├── inventory/
│   │   ├── shopping/
│   │   ├── products/
│   │   ├── categories/
│   │   ├── locations/
│   │   └── household/
│   │
│   └── lib/
│       ├── db/
│       ├── domain/
│       ├── sync/
│       ├── supabase/
│       └── utils/
│
├── supabase/
│   ├── migrations/
│   ├── functions/
│   └── seed/
│
├── docs/
│   ├── PRODUCT.md
│   ├── DATABASE.md
│   ├── SYNC.md
│   ├── ARCHITECTURE.md
│   ├── UI.md
│   └── ROADMAP.md
│
├── public/
│
├── package.json
├── tsconfig.json
├── next.config.ts
└── ...
```

The exact folder names may be adjusted during implementation, but the separation of responsibilities should remain.

---

# 8. Feature boundaries

## `features/inventory`

Responsible for:

- inventory screens
- inventory-specific UI
- inventory application actions
- stock display
- location display
- expiration display
- add/remove/move workflows

It should not contain raw IndexedDB implementation.

## `features/shopping`

Responsible for:

- shopping list
- quantity editing
- shopping states
- purchased workflow
- put-away workflow

It should not directly manage Supabase subscriptions.

## `features/products`

Responsible for:

- product creation/editing
- product search
- product selection
- minimum stock
- barcode field when later enabled

## `features/categories`

Responsible for:

- category management

## `features/locations`

Responsible for:

- location management

## `features/household`

Responsible for:

- initial household setup
- joining household
- basic household state

No elaborate household-management UI is required.

---

# 9. Domain layer

`lib/domain` contains business rules that should not depend on React or UI.

Examples:

```text
calculateCurrentStock()
isLowStock()
getSuggestedShoppingQuantity()
selectLotsForConsumption()
validateShoppingTransition()
```

Domain functions should be deterministic where possible.

Example:

```text
isLowStock(currentStock, minimumStock)
```

should not know anything about:

- Supabase
- Dexie
- React
- browser APIs

This makes the important inventory rules easy to test.

---

# 10. Application/data layer

The application layer coordinates domain rules with persistence.

Conceptual example:

```text
inventory.remove(productId, locationId, quantity)
```

internally:

```text
validate
→ determine affected lots
→ create operation
→ update Dexie
→ enqueue sync
→ trigger sync if online
```

The UI should not have to know those steps.

---

# 11. Repository pattern

Use repositories selectively.

A repository is appropriate when it gives a clear boundary such as:

```text
ProductRepository
InventoryRepository
ShoppingRepository
```

Do not create a generic:

```text
BaseRepository<T>
GenericRepository<T>
UniversalDataService
```

unless actual duplication justifies it.

The application is small enough that explicit code is preferable to abstraction for its own sake.

---

# 12. Local database layer

`lib/db` owns Dexie.

Suggested responsibilities:

```text
database definition
schema/version migrations
local queries
local transactions
reactive queries/hooks
```

Feature code should not directly open IndexedDB transactions.

Example:

```text
features/inventory
        ↓
InventoryRepository
        ↓
Dexie
```

---

# 13. Sync layer

`lib/sync` owns synchronization.

Suggested modules:

```text
outbox
uploader
reconciler
realtime
retry
sync-state
```

Responsibilities:

### Outbox

Creates and stores pending operations.

### Uploader

Sends operations to Supabase.

### Reconciler

Applies server changes to local state.

### Realtime

Subscribes to relevant Supabase events.

### Retry

Handles temporary failures/backoff.

### Sync state

Tracks:

```text
online/offline
syncing
last successful sync
pending count
errors
```

---

# 14. Supabase layer

`lib/supabase` contains:

- browser Supabase client
- server Supabase client
- authentication helpers
- server-side database/RPC access

Keep Supabase-specific implementation out of domain functions.

For example:

Bad:

```text
isLowStock() → supabase.from(...)
```

Good:

```text
isLowStock() → pure calculation

InventoryRepository → Dexie/Supabase
```

---

# 15. Authentication

Use Supabase Auth.

The application should support individual accounts for Martin and Caroline.

Each account has:

```text
auth.users.id
        ↓
household_members
        ↓
household_id
```

No shared login should be used.

Benefits:

- each person's actions have an identity
- audit information is possible
- concurrent use is naturally supported
- household sharing remains simple

---

# 16. Household bootstrap

Initial onboarding:

```text
User signs up/logs in
        ↓
Does household membership exist?
        │
   ┌────┴────┐
   │         │
  No        Yes
   │         │
Create       ↓
household   App
   │
   ↓
Seed categories/locations
   │
   ↓
App
```

Second user:

```text
Login
 ↓
Enter join code
 ↓
Validate
 ↓
Create household_members record
 ↓
Initial synchronization
```

The application should not expose complex household administration in V1.

---

# 17. RLS architecture

Every household-owned table contains:

```text
household_id
```

RLS policies use household membership to determine access.

The frontend is never trusted to enforce this boundary.

Conceptual rule:

```text
current authenticated user
        ↓
household_members
        ↓
authorized household
        ↓
row.household_id
```

RLS should be treated as a core part of the backend architecture, not as a final security step.

---

# 18. Server transactional operations

Use Supabase database functions/RPC for operations requiring atomic multi-row changes.

Likely operations:

```text
remove_inventory()
move_inventory()
put_away_purchased_stock()
mark_shopping_purchased()
```

The exact function list should be kept as small as possible.

Do not turn every CRUD operation into an RPC automatically.

Simple reads and straightforward writes can use normal Supabase queries when safe.

---

# 19. Inventory read model

The UI should not reconstruct every historical operation on every render.

The application should use current local inventory lots as its read model.

Inventory operations provide the mutation/history foundation.

Conceptually:

```text
inventory_operations
       ↓
current inventory_lots
       ↓
Dexie
       ↓
UI
```

The exact server-side maintenance strategy for `inventory_lots.quantity` should be transactional.

---

# 20. Shopping read model

The UI reads active shopping items from Dexie.

Display logic can consolidate product-based items.

Example:

```text
Underlying:
Tomato Sauce intent A: 2
Tomato Sauce intent B: 3

UI:
Tomato Sauce    5
```

The user should not normally see the internal synchronization model.

---

# 21. Realtime subscriptions

Realtime subscriptions belong to the sync layer.

Do not put subscriptions directly in individual page components.

One central synchronization mechanism should manage:

- connection
- subscription
- cleanup
- event deduplication
- reconciliation

This prevents multiple screens from opening competing subscriptions.

---

# 22. Online/offline detection

Use browser network state as a hint.

Conceptual states:

```text
ONLINE
OFFLINE
SYNCING
ERROR
```

Important:

```text
navigator.onLine === true
```

does not guarantee that Supabase is reachable.

The sync layer must use actual request success/failure as the final signal.

---

# 23. UI data flow

Example: removing one item.

```text
User taps "-"
        ↓
Inventory UI
        ↓
inventory.remove()
        ↓
Domain validation
        ↓
Dexie transaction
        ↓
UI updates
        ↓
Outbox operation
        ↓
Supabase upload
        ↓
Server transaction
        ↓
Realtime/reconciliation
        ↓
Other device updates
```

The first visible update should happen locally, not after the server responds.

---

# 24. Error boundaries

The application should distinguish:

### User/input errors

Examples:

- quantity is invalid
- required product missing
- invalid transition

Show inline/actionable feedback.

### Sync errors

Examples:

- temporary network failure

Normally keep working offline and retry.

### Conflict/business errors

Examples:

- another user consumed the last item

Reconcile and explain the resulting state.

### Unexpected application errors

Use appropriate Next.js error boundaries and logging.

Do not expose raw database errors to the user.

---

# 25. State management

Do not introduce a large global state library initially.

Use:

- React state for local UI state
- Dexie/reactive queries for persistent application state
- Supabase Auth state for authentication
- small context/providers only where genuinely global

The local database effectively replaces much of what a large client-side state store would otherwise provide.

Avoid duplicating the same inventory state in:

```text
React state
+
global store
+
Dexie
```

Dexie should be the persistent local source for offline-capable data.

---

# 26. UI design system boundary

Tailwind CSS and Tailwind UI are the starting point.

Create a small internal UI vocabulary as components are needed:

```text
Button
Input
Select
Modal
Sheet
Badge
Card
QuantityControl
ListItem
EmptyState
```

Do not build a complete design system before feature work begins.

Components should be extracted when:

- reused
- complex
- visually standardized
- important to interaction consistency

---

# 27. Responsive/mobile architecture

The application is mobile-first.

Primary design target:

```text
phone portrait
```

Then support:

```text
tablet
desktop
```

The main application navigation should be designed around:

```text
Home
Inventory
Shopping
```

A persistent mobile bottom navigation is appropriate.

Desktop can use a different layout if it improves usability, while retaining the same route structure.

---

# 28. PWA architecture

The application is installable as a PWA.

PWA responsibilities:

- app manifest
- icons
- standalone display
- service worker
- cache-first static assets (`/_next/static/`, `/icons/`)
- network-only document navigation (household HTML is not cached)

The PWA layer should complement Dexie.

It should not be treated as the application's database.

Dexie stores household data.

The service worker does not cache household HTML and does not talk to Supabase.

---

# 29. Notifications

Local opt-in browser notifications exist for low stock and expiration. There is no server push.

Notification evaluation runs in the open tab after an explicit Sync now. Defaults stay off. Permission is requested only after the user enables notifications.

---

# 30. Barcode scanning

Barcode is optional at product create time.

```text
camera or typed digits
 ↓
Open Food Facts lookup (online only)
 ↓
prefill name, then create product
```

External product database calls should remain outside the core inventory domain.

---

# 31. Environment variables

Environment configuration should distinguish public browser configuration from server secrets.

Never expose privileged Supabase credentials to the browser.

Use the current Supabase credential/key naming recommended by Supabase when configuring the project rather than hardcoding an older key convention.

Typical categories:

```text
public Supabase URL
public/publishable client key
server-only secret key where required
```

Exact variable names should be selected during project bootstrap based on the current Supabase documentation.

---

# 32. Deployment architecture

```text
GitHub
   ↓
Vercel
   ↓
Next.js application
   ↓
Supabase
```

Development:

```text
local Next.js
      ↓
Supabase project
```

Production:

```text
Vercel production
      ↓
Supabase production project
```

Initially, a single Supabase project can be used if development/prod separation is not yet necessary. Avoid overengineering deployment environments at this stage.

---

# 33. Logging and diagnostics

The application should have enough diagnostic information to debug sync problems.

Useful fields:

```text
operation_id
user_id
household_id
operation type
created_at
sync attempt
error category
```

Never log:

- passwords
- authentication secrets
- service-role/secret keys
- sensitive tokens

A future sync/debug screen can expose a simplified state such as:

```text
Online
Last synced: 10:42
Pending: 2
```

A full technical debug console is not needed in V1.

---

# 34. Testing architecture

Tests should exist at multiple levels.

## Unit tests

For pure domain logic:

```text
low stock calculation
lot selection
shopping state validation
quantity validation
```

## Integration tests

For:

```text
Dexie operations
outbox
sync behavior
server transactions
RLS
```

## End-to-end tests

For:

```text
login
inventory workflow
shopping workflow
put-away workflow
```

## Manual tests

Especially:

```text
offline
reconnect
two-device concurrency
mobile viewport
PWA
```

---

# 35. Development rules

Cursor implementation must follow these rules:

1. Do not change the architecture without explicit approval.
2. Do not introduce a new major dependency without justification.
3. Do not create generic abstractions prematurely.
4. Do not bypass the domain/application layer from UI components.
5. Do not access IndexedDB directly from feature components.
6. Do not access Supabase directly from arbitrary UI components.
7. Do not bypass RLS for convenience.
8. Do not use absolute inventory quantity updates as the sync mechanism.
9. Do not implement unsupported future features during unrelated slices.
10. Keep each implementation slice small and independently verifiable.

---

# 36. Dependency policy

Initial dependencies should remain minimal.

Likely:

```text
next
react
react-dom
@supabase/ssr
@supabase/supabase-js
dexie
dexie-react-hooks
tailwindcss
```

Additional libraries should be introduced only when they solve a concrete requirement.

Potential later dependencies:

- PWA/service-worker tooling
- date utilities
- validation library
- testing tools
- barcode scanning library

The exact package versions should be selected during implementation using current stable releases.

---

# 37. Architecture decisions that are locked

The following should not be revisited casually:

```text
Next.js
TypeScript
Tailwind CSS
Supabase/PostgreSQL
Supabase Auth
Supabase RLS
Supabase Realtime
Dexie/IndexedDB
custom outbox synchronization
inventory delta/event model
inventory lots
shared household
individual user accounts
```

A change to one of these requires considering its impact on:

```text
DATABASE.md
SYNC.md
ARCHITECTURE.md
ROADMAP.md
```

---

# 38. Architecture decisions intentionally deferred

The following should be decided only when implementation reaches them:

- exact PWA tooling
- exact push notification provider/mechanism
- exact Supabase realtime event strategy
- exact server RPC/function names
- exact test framework
- exact barcode library
- exact external product database
- production/staging environment strategy
- advanced sync conflict UI

These should not block the current database/domain implementation.

---

# 39. Definition of done

The architecture is being followed correctly when:

- UI components do not own persistence
- offline-capable state lives in Dexie
- sync behavior lives in the sync layer
- business rules live in the domain layer
- Supabase-specific code is isolated
- transactional multi-record operations are server-side
- RLS protects household data
- individual users are preserved
- inventory uses deltas/operations
- realtime is supplemental rather than authoritative
- future features can be added without rewriting the core data model

The next specification is `UI.md`, which defines the concrete screens, navigation, interactions, states and responsive behavior.
