# Household Organizer — Product Specification

Version: 1.0
Status: V1 product specification

## 1. Product overview

Household Organizer is a private, shared household inventory and shopping application for two people.

Its primary purpose is to answer:

- What do we have?
- Where is it?
- What are we running low on?
- What needs to be bought?
- What did we buy but have not put away yet?
- What is expiring soon?

The application is optimized for fast mobile use and must support the core workflows offline.

---

# 2. Target users

The application is intended for one household shared by two people.

Each person has their own account.

There is no need for:

- public profiles
- social features
- multiple-household user interfaces
- complex roles or permissions

The household is private.

---

# 3. Core product concepts

## Products

A product is a reusable household item definition.

Examples:

```text
Tomato Sauce
Toilet Paper
Dishwasher Tabs
Shampoo
Laundry Detergent
```

A product remains available in the catalog even when its stock reaches zero.

## Categories

Products belong to one editable category.

Initial categories:

```text
Food
Drinks
Cleaning
Personal Care
Household
Other
```

## Locations

Inventory can be assigned to physical household locations.

Initial locations:

```text
Kitchen
Bathroom
Cellar
Living room
```

Locations are editable data rather than hardcoded application values.

## Inventory

Inventory represents physical stock.

A product can exist in multiple locations.

Example:

```text
Tomato Sauce

Kitchen: 2
Cellar: 4
Total: 6
```

## Shopping list

The shopping list represents things the household intends to buy.

Shopping and inventory are separate.

Buying something does not automatically increase inventory.

## Purchased-but-unsorted stock

Purchased items can exist temporarily between shopping and inventory.

Example:

```text
Shopping:
Tomato Sauce x4

Purchased:
Tomato Sauce x4

Inventory:
unchanged
```

The user later decides where the items go.

---

# 4. Inventory requirements

## 4.1 Quantity

Quantities are integers.

V1 does not require units such as:

```text
kg
liters
packs
bottles
```

The user simply tracks quantities.

## 4.2 Multiple locations

A product can be stored in multiple locations.

Example:

```text
Kitchen: 2
Cellar: 4
```

The total is:

```text
6
```

## 4.3 Adding stock

The user can add stock by specifying:

```text
product
quantity
location
optional expiration date
```

## 4.4 Consuming stock

The primary consumption interaction is:

```text
[ - ] quantity [ + ]
```

Removing one unit should be extremely fast.

## 4.5 Moving stock

The application may provide a Move action:

```text
Cellar → Kitchen
Quantity: 2
```

However, users should not be forced to track the destination.

For example, if toilet paper is moved upstairs but the user only cares about cellar stock, they can simply decrease the cellar quantity.

## 4.6 Expiration

Expiration dates are optional.

Expiration belongs to physical stock rather than the reusable product definition.

This allows different quantities of the same product to have different expiration dates.

---

# 5. Product requirements

Each product should have:

```text
Name
Category
Minimum stock
Optional barcode
Active/archived state
```

Product photos are not required.

Products should be searchable even when stock is zero.

Example:

```text
Tomato Sauce
OUT OF STOCK
```

This allows users to quickly add known products to the shopping list.

---

# 6. Minimum stock

Users can define a minimum stock level.

Example:

```text
Tomato Sauce
Current: 1
Minimum: 3
```

This means the product is low stock.

The application should suggest:

```text
Add 2 to shopping list?
```

The calculation is:

```text
minimum stock - current stock
```

The application must not automatically add the item to shopping.

The user confirms the suggestion.

---

# 7. Shopping list requirements

The shopping list is shared between the two household users.

It must support:

- adding products
- adding free-text items
- changing quantities
- removing items
- marking items purchased
- storing purchased items later

## Product shopping items

Example:

```text
Tomato Sauce x5
```

If both users add the same product:

```text
Martin: +2
Caroline: +3
```

the household should see:

```text
Tomato Sauce x5
```

The underlying synchronization model must prevent lost quantities.

## Free-text shopping items

For things that do not need a product record:

```text
Birthday candles
Gift wrapping paper
```

These can be added as free-text items.

They do not automatically become inventory.

---

# 8. Shopping lifecycle

The normal lifecycle is:

```text
PENDING
   ↓
PURCHASED
   ↓
STORED
```

## PENDING

The household needs to buy the item.

## PURCHASED

The item has been bought but is not necessarily in inventory yet.

## STORED

The purchased quantity has been assigned to inventory locations.

---

# 9. Put-away workflow

Purchased stock can be distributed across locations.

Example:

```text
Purchased:
Tomato Sauce x4
```

User chooses:

```text
Kitchen: 2
Cellar: 2
```

Result:

```text
Kitchen: +2
Cellar: +2
Purchased remaining: 0
```

Partial storage must be supported.

Example:

```text
Purchased: 4
Stored: 2
Remaining: 2
```

The remaining quantity stays in the purchased-but-unsorted state.

---

# 10. Immediate consumption

The application should support using an item before it is put away.

Example:

```text
Purchased: 4
Consumed immediately: 1
Remaining to store: 3
```

The system must keep the quantities consistent.

---

# 11. Dashboard requirements

Home should provide a useful overview.

Priority information:

1. Add item
2. Low-stock products
3. Expiring-soon products
4. Purchased items waiting to be stored
5. Location shortcuts
6. Shopping overview

The dashboard should not become a statistics screen.

---

# 12. Search

Search should work locally so that it remains available offline.

Search should cover the product catalog, not just current stock.

Example:

```text
Search: Tomato

Tomato Sauce
Tomato Paste
Tomato Soup
```

A zero-stock product should still appear.

---

# 13. Offline requirements

Offline operation is a V1 requirement.

The main reason is physical household use in locations where connectivity may be unavailable.

Core offline workflows:

```text
view inventory
search products
add stock
remove stock
move stock
view expiration
view shopping
add shopping items
change shopping quantities
mark purchased
put away purchased stock
```

Changes made offline must:

- appear immediately
- survive browser restart
- synchronize when connectivity returns
- not overwrite another user's independent changes
- not be duplicated by retries

Account creation and external product lookups may require connectivity.

---

# 14. Shared household behavior

Both users should see shared state.

Example:

```text
Martin adds:
Tomato Sauce x2

Caroline opens the app:

Tomato Sauce x2
```

Changes made by either person should eventually appear on the other device.

Each user remains individually authenticated.

---

# 15. Notifications

Notifications are opt-in local browser notifications. There is no remote push.

Users can enable Low stock and Expiration after granting browser permission. Purchased-waiting notifications are not implemented.

Notifications must not be required for core functionality.

---

# 16. PWA

The application should be installable as a PWA.

Goals:

- launch like a mobile application
- support offline core workflows
- provide appropriate icons and manifest
- do not cache household HTML in the service worker

The PWA is a delivery mechanism.

IndexedDB/Dexie remains responsible for local household data.

---

# 17. Barcode

Barcode is optional at product create time. Users can type digits or scan with the device camera, then look up a name on Open Food Facts while online. Manual entry always remains available. Existing products show a read-only barcode; editing is not in V1.

---

# 18. Explicit V1 exclusions

Do not implement these in V1:

```text
Product photos
Receipt scanning
Voice input
Meal planning
Recipes
Cost tracking
Statistics
Store-specific shopping lists
AI features
Social login
Multiple household management UI
Complex permissions
Activity feed
```

These are future possibilities, not current requirements.

---

# 19. UX priorities

The product should optimize for:

### 1. Speed

Common actions should require very few taps.

### 2. Clarity

The user should immediately understand:

```text
what exists
where it exists
what needs attention
```

### 3. Reliability

Offline actions must not disappear.

### 4. Shared state

Both users should have the same household picture after synchronization.

### 5. Simplicity

The technical complexity of offline synchronization should not appear in the normal user experience.

---

# 20. V1 success criteria

The product is successful when two household users can:

```text
create accounts
join the same household
create products
organize products into categories
define locations
add inventory
track inventory across locations
consume inventory
move inventory
set minimum stock
receive low-stock suggestions
set expiration dates
manage a shared shopping list
mark purchases
put purchases away
use core features offline
synchronize safely
install the app as a PWA
```

The application should feel like a simple household utility rather than an inventory-management system.

---

# 21. Product principles for future decisions

When evaluating a new feature, prioritize:

```text
Does it make household inventory faster?
Does it reduce manual work?
Does it improve reliability?
Does it solve a real recurring household problem?
Does it work naturally with the offline-first model?
```

Avoid adding features simply because they are technically interesting.

The product should remain focused on household inventory and shopping.
