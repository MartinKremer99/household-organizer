# Household Organizer — UI Specification

Version: 1.0
Status: Implementation-ready specification
Design target: Mobile-first

## 1. Purpose

This document defines the user-facing structure of Household Organizer.

The UI should make the most common household actions extremely fast:

- check what is available
- change quantity
- find an item
- add something to shopping
- mark a purchase
- put purchased items away
- see what is running low
- see what is expiring soon

The underlying architecture is more complex because of offline synchronization, but the UI should remain simple.

---

# 2. Primary navigation

The main application has three primary destinations:

```text
Home
Inventory
Shopping
```

Recommended mobile navigation:

```text
┌─────────────────────────────────────┐
│                                     │
│              CONTENT                │
│                                     │
│                                     │
├─────────────┬───────────┬───────────┤
│    Home     │ Inventory │  Shopping │
└─────────────┴───────────┴───────────┘
```

The active destination must be visually obvious.

Settings can be accessed from Home/profile/menu and does not need a permanent bottom-navigation slot.

---

# 3. Global UI principles

## 3.1 Mobile first

Primary target:

```text
phone portrait
```

Design for touch.

Interactive targets should be comfortably tappable.

Avoid dense desktop-style tables for core workflows.

## 3.2 Fast actions

The application should minimize navigation for frequent actions.

Common actions should require very few taps:

```text
Remove 1:
Inventory → product → -

Add to shopping:
Inventory/product → Add to shopping
```

## 3.3 Clear quantities

Quantity should be visually prominent.

Example:

```text
Tomato Sauce

Kitchen        2
Cellar         4

Total          6
```

## 3.4 No unnecessary information

Do not expose synchronization internals, database concepts, or batch terminology unless needed.

For example, show:

```text
6 in stock
```

rather than:

```text
3 inventory lots / 6 units / 2 operations pending
```

---

# 4. Home screen

## 4.1 Purpose

Home is the household overview and launch point.

Recommended structure:

```text
Good morning / Household

┌──────────────────────────────┐
│ + Add item                   │
└──────────────────────────────┘

Low stock
──────────────────────────────
Tomato Sauce          1 / min 3
Toilet Paper          2 / min 6

Expiring soon
──────────────────────────────
Milk                  2 days
...

Purchased
──────────────────────────────
4 items waiting to be stored

Quick locations
──────────────────────────────
[Kitchen] [Bathroom]
[Cellar]  [Living room]

Recent shopping / active list
──────────────────────────────
...
```

The exact content can be adjusted once real usage is tested.

## 4.2 Priority

The primary Home action is:

```text
+ Add item
```

Low-stock information should be visible without opening another page.

If nothing needs attention, show useful empty states rather than blank space.

---

# 5. Add item flow

Adding an item is one of the most important workflows.

## 5.1 Entry point

Accessible from:

- Home
- Inventory
- potentially Shopping when converting a shopping item into a product

Primary action:

```text
+ Add item
```

## 5.2 Product selection

The first step should ask:

```text
What are you adding?
```

Search existing products first.

Example:

```text
Search products...

Tomato Sauce
Tomato Paste
Tomato Soup
```

If no matching product exists:

```text
Create new product
```

This prevents duplicate product records.

## 5.3 New product form

Minimum fields:

```text
Name
Category
Minimum stock
```

Optional later:

```text
Barcode
```

Do not require a product image.

## 5.4 Stock entry

After selecting/creating a product:

```text
Quantity
Location
Expiration date (optional)
```

Example:

```text
Tomato Sauce

Quantity
[ - ]  4  [ + ]

Location
[ Cellar ▼ ]

Expiration
[ 12/01/2027 ]

[ Add stock ]
```

The quantity input may also support direct numeric entry.

## 5.5 Offline behavior

The entire add-stock workflow should work offline.

The user should not see a blocking "waiting for server" state.

---

# 6. Inventory screen

## 6.1 Purpose

Inventory is the main stock-management screen.

Recommended structure:

```text
Inventory

[ Search products... ]

[All] [Kitchen] [Bathroom] [Cellar] [Living room]

Category:
[All categories ▼]

--------------------------------
Tomato Sauce                    6
Kitchen 2 · Cellar 4
                         [ - ] [+]
--------------------------------
Toilet Paper                    2
Cellar 2
                         [ - ] [+]
--------------------------------
Dishwasher Tabs                18
Kitchen 18
                         [ - ] [+]
--------------------------------
```

## 6.2 Product list

Each product row/card should show:

- product name
- total quantity
- relevant location quantities
- low-stock indicator when applicable
- expiration indicator when relevant
- quick quantity controls

The product list should be scannable.

## 6.3 Quantity controls

Primary interaction:

```text
[ - ]  quantity  [ + ]
```

Tapping:

```text
-
```

removes one unit.

Tapping:

```text
+
```

adds one unit.

The default location for `+` must be deterministic.

Recommended:

- if product exists in exactly one location, use that location
- otherwise open a small location selection
- alternatively, remember the user's last-used location for that product

The exact defaulting rule should be validated during implementation.

## 6.4 Product detail

Tap a product to open detail.

Example:

```text
Tomato Sauce

Total
6

Kitchen
2
[ - ]        [ + ]

Cellar
4
[ - ]        [ + ]

Expiration
Jan 12, 2027
Jun 20, 2027

Minimum stock
3

[ Add to shopping ]
[ Move stock ]
```

The product detail page is where location-specific and expiration information can be exposed without cluttering the main list.

---

# 7. Location filtering

Locations are data-driven.

Initial filters:

```text
All
Kitchen
Bathroom
Cellar
Living room
```

The UI should derive these from the active locations in the database.

If the user later adds:

```text
Garage
```

it should automatically become available.

No code change should be required.

---

# 8. Category filtering

Categories should be similarly data-driven.

Initial:

```text
All
Food
Drinks
Cleaning
Personal Care
Household
Other
```

Category filtering can be a horizontal filter or a select/dropdown depending on available width.

On small screens, avoid having both category and location filters consume excessive vertical space.

A filter sheet can be used if necessary.

---

# 9. Search

Search must search the product catalog, not only products currently in stock.

Example:

```text
Search:
Tomato Sauce
```

Result:

```text
Tomato Sauce
OUT OF STOCK
On shopping list
```

This is important because users need to find products they regularly purchase even when current quantity is zero.

Search should be local and therefore work offline.

---

# 10. Low-stock presentation

Low stock means:

```text
current stock < minimum stock
```

Example:

```text
Current: 1
Minimum: 3
```

Display:

```text
Low stock
```

and optionally:

```text
1 / 3
```

The UI should offer:

```text
Add 2 to shopping list?
```

The suggestion is:

```text
minimum stock - current stock
```

Low stock must not automatically modify the shopping list.

---

# 11. Expiration presentation

Expiration is optional.

Possible states:

```text
Expires today
Expires tomorrow
Expires in 3 days
Expires on Jan 12
Expired
```

The exact thresholds and wording can be finalized during implementation.

Expiration warnings should be visually noticeable without dominating normal inventory display.

Products without expiration dates should not show an expiration placeholder.

---

# 12. Shopping screen

## 12.1 Purpose

Shopping is a shared household list.

Recommended structure:

```text
Shopping

[ + Add ]

To buy
────────────────────────
Tomato Sauce             5
Toilet Paper             6
Birthday candles         1

Purchased
────────────────────────
Milk                     2
Bread                    1
```

The user should be able to switch between:

```text
To buy
Purchased
```

or see both sections on one screen.

## 12.2 Adding a shopping item

Primary flow:

```text
+ Add
```

Then:

```text
Search products...
```

or:

```text
Add something else
```

For an existing product:

```text
Tomato Sauce
Quantity [ 3 ]

[ Add to shopping ]
```

For free text:

```text
What do you need?

Birthday candles
Quantity [ 1 ]

[ Add ]
```

---

# 13. Shopping quantity controls

Product-based shopping items should support:

```text
[ - ]  5  [ + ]
```

Changes are shared and offline-capable.

If two users add quantities while offline, the synchronization layer must prevent lost updates.

The UI should display the consolidated quantity rather than exposing synchronization intents.

---

# 14. Marking items purchased

A shopping item can be marked:

```text
PURCHASED
```

This should be a quick action.

Example:

```text
Tomato Sauce x4
[ Purchased ]
```

After tapping:

```text
Tomato Sauce x4
Purchased
```

The item does not yet appear in inventory.

Instead it becomes purchased-but-unsorted stock.

---

# 15. Purchased screen/state

Purchased stock needs to be visible.

Example:

```text
Purchased

Tomato Sauce       4
Milk               2
Toilet Paper       6

[ Put away ]
```

This state should be hard to miss because it represents an unfinished household task.

Home should also surface purchased stock waiting to be stored.

---

# 16. Put-away workflow

When the user selects:

```text
Put away Tomato Sauce x4
```

show:

```text
Tomato Sauce

4 remaining

Kitchen
[ 0 ]

Cellar
[ 0 ]

Remaining
4
```

User can allocate:

```text
Kitchen 2
Cellar 2
```

Then:

```text
Remaining
0

[ Done ]
```

The user should also be able to store only part of the quantity.

Example:

```text
Purchased: 4
Put away: 2
Remaining: 2
```

The remaining 2 stay in purchased-but-unsorted state.

---

# 17. Immediate consumption after purchase

The workflow must support:

```text
Purchased 4
Consumed 1
Remaining 3 to store
```

This is useful for things such as food consumed immediately after shopping.

The UI can offer:

```text
Consume
```

or allow the user to reduce the unsorted quantity.

The exact interaction can be finalized during implementation.

---

# 18. Moving stock

Product detail should provide:

```text
Move stock
```

Example:

```text
Move 2

From:
Cellar

To:
Kitchen

Quantity:
2

[ Move ]
```

This is a convenience workflow.

The user should still be able to simply remove stock from one location when they do not care about tracking the destination.

Example:

```text
Cellar: Toilet Paper 6
→ move upstairs
→ Cellar becomes 4
```

No bathroom inventory needs to be created.

---

# 19. Product management

Product management can be accessed through:

- product detail
- settings
- add-product flow

Editable:

```text
Name
Category
Minimum stock
Barcode (later)
Active/archive status
```

Do not expose database IDs.

---

# 20. Category management

Settings should allow:

```text
Categories

Food
Drinks
Cleaning
Personal Care
Household
Other

[ + Add category ]
```

Actions:

```text
Rename
Archive
```

Do not allow deleting a category that has referenced products.

Archive it instead.

---

# 21. Location management

Similarly:

```text
Locations

Kitchen
Bathroom
Cellar
Living room

[ + Add location ]
```

Actions:

```text
Rename
Reorder
Archive
```

Existing inventory remains associated with archived locations.

---

# 22. Settings

Keep settings minimal.

Possible sections:

```text
Household
Categories
Locations
Notifications
Account
```

V1 household settings:

```text
Household name (rename)
Join code
```

No member-management UI is required.

---

# 23. Authentication screens

Required:

```text
/login
```

There is no public signup UI. Production Auth should use invite-only or disabled public signup.

After login:

```text
Household exists?
```

If not:

```text
Create household
```

If not a member:

```text
Join household
```

Joining requires the household join code.

The authentication experience should remain separate from normal household navigation.

---

# 24. Offline/sync indicator

The application should provide lightweight feedback about connectivity.

Recommended status:

```text
Online
Offline
Syncing
Needs attention
```

Example:

```text
Offline · Changes will sync when you're back online
```

Avoid large banners that permanently consume screen space.

A small status indicator in the header is preferable.

When there are pending operations:

```text
2 changes waiting to sync
```

A detailed technical sync dashboard is not needed.

---

# 25. Loading states

Because the app is local-first, loading should be minimal after initial data is available.

Use:

- skeletons during initial local/server setup
- inline progress for actions that truly require server confirmation
- optimistic UI for supported offline workflows

Do not show a full-screen spinner every time the user changes quantity.

---

# 26. Empty states

Every primary screen needs a useful empty state.

## Empty inventory

```text
No products yet.

Add your first household item.

[ + Add item ]
```

## Empty shopping list

```text
Nothing to buy.

[ + Add ]
```

## Empty purchased state

```text
Nothing waiting to be stored.
```

## Search with no results

```text
No products found.

[ Create product ]
```

---

# 27. Confirmation behavior

Avoid confirmation dialogs for reversible, low-risk actions such as:

```text
remove 1
add 1
change shopping quantity
```

Use confirmation for potentially destructive actions such as:

```text
archive product
archive location
archive category
```

Undo can be considered for quantity changes later.

---

# 28. Accessibility

Minimum requirements:

- keyboard-accessible controls
- visible focus states
- semantic buttons/inputs
- accessible labels for icon-only controls
- sufficient text contrast
- screen-reader labels for quantity controls
- do not communicate status through color alone

Quantity buttons must have accessible labels such as:

```text
Decrease Tomato Sauce quantity
Increase Tomato Sauce quantity
```

---

# 29. Responsive behavior

## Mobile

Primary design target.

Use:

- bottom navigation
- cards/list rows
- sheets/modals for secondary actions
- compact filters

## Tablet

Allow more information per row.

## Desktop

A side navigation or top navigation may replace the mobile bottom bar.

Inventory can become a wider list/grid if useful.

Do not create separate desktop-only workflows.

---

# 30. Tailwind UI usage

Tailwind UI should be used as a component/design source.

Do not copy complete pages blindly.

The app should establish a small visual language:

```text
typography
spacing
border radius
buttons
inputs
cards
badges
sheets/modals
```

Feature components should use those conventions consistently.

---

# 31. Visual hierarchy

The UI should emphasize:

1. Primary action
2. Current quantity/state
3. Problems requiring attention
4. Secondary information
5. Configuration

For example:

```text
Tomato Sauce          1
LOW STOCK

Kitchen               1
Minimum               3

[ + Add to shopping ]
```

is preferable to showing every database property equally.

---

# 32. Notifications UI

When notifications are introduced:

Settings should allow basic preferences such as:

```text
Low stock notifications
Expiration notifications
Purchased items waiting to be stored
```

The notification feature must not be required for core inventory functionality.

---

# 33. Barcode UI

Barcode fields appear on create only (Add product). Users can type a barcode or open Scan barcode. Existing products show the barcode as read-only.

Manual product entry must remain available.

---

# 34. UI states that must be designed

Every important screen should account for:

```text
initial loading
empty
normal
offline
syncing
sync error
server rejection
searching
no search results
archived/disabled referenced data
```

Do not design only the happy path.

---

# 35. V1 screens

The minimum screen set is:

```text
/login

/
  Home

/inventory
  Inventory list

/inventory/[productId]
  Product detail

/shopping
  Shopping list

/shopping/purchased
  Purchased / put-away workflow

/settings
  Settings

/settings/categories
/settings/locations
```

Routes can be simplified if the implementation benefits from modal/sheet workflows, but the underlying navigation concepts should remain.

---

# 36. V1 primary workflows

The following workflows must be usable without needing to understand the application's technical model.

### Add inventory

```text
Home
→ Add item
→ Search/create product
→ Quantity
→ Location
→ Optional expiration
→ Add
```

### Consume

```text
Inventory
→ product
→ -
```

### Add shopping

```text
Shopping
→ Add
→ product/free text
→ quantity
→ Add
```

### Purchase

```text
Shopping
→ Purchased
```

### Put away

```text
Home/Purchased
→ item
→ allocate locations
→ Done
```

### Move

```text
Product
→ Move
→ source
→ destination
→ quantity
→ Move
```

### Low stock

```text
Inventory/Home
→ Low stock item
→ Add suggested quantity to shopping
```

---

# 37. Definition of done

The UI specification is correctly implemented when:

- the app is comfortable to use on a phone
- Home provides a useful household overview
- Inventory supports fast quantity changes
- Shopping is clearly separate from inventory
- purchased-but-unsorted stock is visible
- put-away supports partial allocation
- products can exist at multiple locations
- search finds zero-stock products
- low-stock suggestions are user-confirmed
- expiration information is understandable
- offline state is communicated without blocking the user
- empty/error states are designed
- the same core workflows work on desktop and mobile
- UI components follow a consistent Tailwind/Tailwind UI-based visual language

The next document should be `ROADMAP.md`, which converts all specifications into implementation phases and small Cursor-ready slices.
