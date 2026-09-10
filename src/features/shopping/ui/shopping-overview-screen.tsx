"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { listActiveLocations } from "@/features/locations/application/manage-locations";
import { listActiveProducts } from "@/features/products/application/manage-products";
import {
  addFreeTextShoppingItem,
  addProductShoppingItem,
  changeShoppingQuantity,
  consumePurchasedStock,
  listPendingShoppingItems,
  listPurchasedShoppingItems,
  listPurchasedStock,
  markFreeTextItemStored,
  markShoppingItemPurchased,
  putAwayPurchasedStock,
} from "@/features/shopping/application/manage-shopping";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/text-field";
import { shoppingErrorMessage } from "./shopping-errors";

export type ShoppingOverviewScreenApi = {
  listPendingShoppingItems: typeof listPendingShoppingItems;
  listPurchasedShoppingItems: typeof listPurchasedShoppingItems;
  listPurchasedStock: typeof listPurchasedStock;
  addProductShoppingItem: typeof addProductShoppingItem;
  addFreeTextShoppingItem: typeof addFreeTextShoppingItem;
  changeShoppingQuantity: typeof changeShoppingQuantity;
  markShoppingItemPurchased: typeof markShoppingItemPurchased;
  putAwayPurchasedStock: typeof putAwayPurchasedStock;
  consumePurchasedStock: typeof consumePurchasedStock;
  markFreeTextItemStored: typeof markFreeTextItemStored;
  listActiveProducts: typeof listActiveProducts;
  listActiveLocations: typeof listActiveLocations;
};

type ShoppingItem = Awaited<
  ReturnType<ShoppingOverviewScreenApi["listPendingShoppingItems"]>
>[number];
type Product = Awaited<ReturnType<ShoppingOverviewScreenApi["listActiveProducts"]>>[number];
type Location = Awaited<ReturnType<ShoppingOverviewScreenApi["listActiveLocations"]>>[number];
type PurchasedStockView = Extract<
  Awaited<ReturnType<ShoppingOverviewScreenApi["listPurchasedStock"]>>,
  { ok: true }
>["value"][number];

type Tab = "buy" | "purchased";
type DialogKind = "add" | "putAway" | "consume" | null;
type AddMode = "product" | "freeText";

const defaults: ShoppingOverviewScreenApi = {
  listPendingShoppingItems,
  listPurchasedShoppingItems,
  listPurchasedStock,
  addProductShoppingItem,
  addFreeTextShoppingItem,
  changeShoppingQuantity,
  markShoppingItemPurchased,
  putAwayPurchasedStock,
  consumePurchasedStock,
  markFreeTextItemStored,
  listActiveProducts,
  listActiveLocations,
};

const SELECT_CLASS =
  "min-h-11 rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

function parsePositiveInteger(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    return null;
  }
  return Number.parseInt(trimmed, 10);
}

export function ShoppingOverviewScreen({
  householdId,
  userId,
  api,
}: {
  householdId: string;
  userId: string;
  api?: Partial<ShoppingOverviewScreenApi>;
}) {
  const shopping = useMemo(() => ({ ...defaults, ...api }), [api]);
  const catalogLoadedRef = useRef(false);
  const [pendingItems, setPendingItems] = useState<ShoppingItem[]>([]);
  const [purchasedItems, setPurchasedItems] = useState<ShoppingItem[]>([]);
  const [purchasedStock, setPurchasedStock] = useState<PurchasedStockView[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("buy");
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<AddMode>("product");
  const [addProductId, setAddProductId] = useState("");
  const [addFreeText, setAddFreeText] = useState("");
  const [addQuantity, setAddQuantity] = useState("1");
  const [activeProductId, setActiveProductId] = useState("");
  const [putAwayQuantity, setPutAwayQuantity] = useState("");
  const [putAwayLocationId, setPutAwayLocationId] = useState("");
  const [putAwayExpiration, setPutAwayExpiration] = useState("");
  const [consumeQuantity, setConsumeQuantity] = useState("");

  useEffect(() => {
    catalogLoadedRef.current = false;
  }, [householdId]);

  useEffect(() => {
    let cancelled = false;

    const catalogPromise = catalogLoadedRef.current
      ? Promise.resolve(null)
      : Promise.all([
          shopping.listActiveProducts(householdId),
          shopping.listActiveLocations(householdId),
        ]);

    void Promise.all([
      shopping.listPendingShoppingItems(householdId),
      shopping.listPurchasedShoppingItems(householdId),
      shopping.listPurchasedStock(householdId),
      catalogPromise,
    ])
      .then(([nextPending, nextPurchased, stock, catalog]) => {
        if (cancelled) {
          return;
        }
        if (catalog) {
          catalogLoadedRef.current = true;
          setProducts(catalog[0]);
          setLocations(catalog[1]);
        }
        if (!stock.ok) {
          setError("Could not load shopping.");
          return;
        }
        setPendingItems(nextPending);
        setPurchasedItems(nextPurchased);
        setPurchasedStock(stock.value);
        setError(null);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setError("Could not load shopping.");
      });

    return () => {
      cancelled = true;
    };
  }, [householdId, shopping]);

  const purchasedFreeText = purchasedItems.filter((item) => item.free_text !== null);
  const purchasedCount = purchasedStock.length + purchasedFreeText.length;
  const phase = loaded ? "ready" : error ? "error" : "loading";
  const activeName =
    products.find((product) => product.id === activeProductId)?.name ?? "Unavailable product";

  function productName(productId: string | null): string {
    if (!productId) {
      return "Unavailable product";
    }
    return products.find((product) => product.id === productId)?.name ?? "Unavailable product";
  }

  function itemName(item: ShoppingItem): string {
    return item.free_text ?? productName(item.product_id);
  }

  function closeDialog() {
    if (pending) {
      return;
    }
    setDialog(null);
    setFormError(null);
  }

  function openAdd() {
    setFormError(null);
    setAddMode("product");
    setAddProductId("");
    setAddFreeText("");
    setAddQuantity("1");
    setDialog("add");
  }

  function openPutAway(row: PurchasedStockView) {
    setFormError(null);
    setActiveProductId(row.product_id);
    setPutAwayQuantity(String(row.quantity));
    setPutAwayLocationId(locations[0]?.id ?? "");
    setPutAwayExpiration("");
    setDialog("putAway");
  }

  function openConsume(row: PurchasedStockView) {
    setFormError(null);
    setActiveProductId(row.product_id);
    setConsumeQuantity(String(row.quantity));
    setDialog("consume");
  }

  async function refreshShopping() {
    try {
      const [nextPending, nextPurchased, stock] = await Promise.all([
        shopping.listPendingShoppingItems(householdId),
        shopping.listPurchasedShoppingItems(householdId),
        shopping.listPurchasedStock(householdId),
      ]);
      if (!stock.ok) {
        setError("Could not load shopping.");
        return;
      }
      setPendingItems(nextPending);
      setPurchasedItems(nextPurchased);
      setPurchasedStock(stock.value);
      setError(null);
    } catch {
      setError("Could not load shopping.");
    }
  }

  async function submitAdd() {
    const quantity = parsePositiveInteger(addQuantity);
    if (quantity === null) {
      setFormError(shoppingErrorMessage("invalid_quantity"));
      return;
    }
    if (addMode === "freeText" && addFreeText.trim() === "") {
      setFormError(shoppingErrorMessage("invalid_shopping_item"));
      return;
    }
    setPending(true);
    setFormError(null);
    const result =
      addMode === "product"
        ? await shopping.addProductShoppingItem({
            household_id: householdId,
            user_id: userId,
            product_id: addProductId,
            quantity,
          })
        : await shopping.addFreeTextShoppingItem({
            household_id: householdId,
            user_id: userId,
            free_text: addFreeText,
            quantity,
          });
    setPending(false);
    if (!result.ok) {
      setFormError(shoppingErrorMessage(result.code));
      return;
    }
    setDialog(null);
    setFormError(null);
    await refreshShopping();
  }

  async function submitPutAway() {
    const quantity = parsePositiveInteger(putAwayQuantity);
    if (quantity === null) {
      setFormError(shoppingErrorMessage("invalid_quantity"));
      return;
    }
    setPending(true);
    setFormError(null);
    const result = await shopping.putAwayPurchasedStock({
      household_id: householdId,
      user_id: userId,
      product_id: activeProductId,
      location_id: putAwayLocationId,
      quantity,
      ...(putAwayExpiration ? { expiration_date: putAwayExpiration } : {}),
    });
    setPending(false);
    if (!result.ok) {
      setFormError(shoppingErrorMessage(result.code));
      return;
    }
    setDialog(null);
    setFormError(null);
    await refreshShopping();
  }

  async function submitConsume() {
    const quantity = parsePositiveInteger(consumeQuantity);
    if (quantity === null) {
      setFormError(shoppingErrorMessage("invalid_quantity"));
      return;
    }
    setPending(true);
    setFormError(null);
    const result = await shopping.consumePurchasedStock({
      household_id: householdId,
      product_id: activeProductId,
      quantity,
    });
    setPending(false);
    if (!result.ok) {
      setFormError(shoppingErrorMessage(result.code));
      return;
    }
    setDialog(null);
    setFormError(null);
    await refreshShopping();
  }

  async function changeQuantity(item: ShoppingItem, next: number) {
    setPending(true);
    setError(null);
    const result = await shopping.changeShoppingQuantity({
      household_id: householdId,
      shopping_item_id: item.id,
      quantity: next,
    });
    setPending(false);
    if (!result.ok) {
      setError(shoppingErrorMessage(result.code));
      return;
    }
    await refreshShopping();
  }

  async function markPurchased(item: ShoppingItem) {
    setPending(true);
    setError(null);
    const result = await shopping.markShoppingItemPurchased({
      household_id: householdId,
      user_id: userId,
      shopping_item_id: item.id,
    });
    setPending(false);
    if (!result.ok) {
      setError(shoppingErrorMessage(result.code));
      return;
    }
    await refreshShopping();
  }

  async function markStored(item: ShoppingItem) {
    setPending(true);
    setError(null);
    const result = await shopping.markFreeTextItemStored({
      household_id: householdId,
      shopping_item_id: item.id,
    });
    setPending(false);
    if (!result.ok) {
      setError(shoppingErrorMessage(result.code));
      return;
    }
    await refreshShopping();
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight">Shopping</h1>
      <Button type="button" onClick={openAdd}>
        Add
      </Button>

      <div role="tablist" className="flex flex-wrap gap-2">
        <Button
          type="button"
          role="tab"
          variant={tab === "buy" ? "primary" : "secondary"}
          aria-selected={tab === "buy"}
          onClick={() => setTab("buy")}
        >
          To buy
        </Button>
        <Button
          type="button"
          role="tab"
          variant={tab === "purchased" ? "primary" : "secondary"}
          aria-selected={tab === "purchased"}
          onClick={() => setTab("purchased")}
        >
          Purchased ({purchasedCount})
        </Button>
      </div>

      {phase === "loading" ? (
        <p role="status" className="text-sm">
          Loading shopping…
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm">
          {error}
        </p>
      ) : null}

      {phase === "ready" && tab === "buy" ? (
        <div role="tabpanel">
          {pendingItems.length === 0 ? (
            <p className="text-sm text-foreground/80">Nothing to buy.</p>
          ) : (
            pendingItems.map((item) => {
              const name = itemName(item);
              return (
                <Card key={item.id} title={name}>
                  {item.free_text ? <p>Note</p> : null}
                  <p>{item.quantity}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label={`Decrease ${name} quantity`}
                      disabled={pending || item.quantity <= 1}
                      onClick={() => void changeQuantity(item, item.quantity - 1)}
                    >
                      −
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label={`Increase ${name} quantity`}
                      disabled={pending}
                      onClick={() => void changeQuantity(item, item.quantity + 1)}
                    >
                      +
                    </Button>
                    <Button
                      type="button"
                      disabled={pending}
                      onClick={() => void markPurchased(item)}
                    >
                      Mark {name} purchased
                    </Button>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      ) : null}

      {phase === "ready" && tab === "purchased" ? (
        <div role="tabpanel">
          {purchasedStock.length === 0 && purchasedFreeText.length === 0 ? (
            <p className="text-sm text-foreground/80">Nothing waiting to be stored.</p>
          ) : null}
          {purchasedStock.map((row) => {
            const name = productName(row.product_id);
            return (
              <Card key={row.product_id} title={name}>
                <p>{row.quantity} remaining</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() => openPutAway(row)}
                  >
                    Put away {name}
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={pending}
                    onClick={() => openConsume(row)}
                  >
                    Consume {name}
                  </Button>
                </div>
              </Card>
            );
          })}
          {purchasedFreeText.map((item) => {
            const name = item.free_text ?? "Note";
            return (
              <Card key={item.id} title={name}>
                <p>Note</p>
                <p>{item.quantity}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() => void markStored(item)}
                  >
                    Mark {name} stored
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}

      <Dialog
        open={dialog === "add"}
        title="Add to shopping"
        titleId="shopping-add-title"
        onClose={closeDialog}
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submitAdd();
          }}
        >
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={addMode === "product" ? "primary" : "secondary"}
              aria-pressed={addMode === "product"}
              onClick={() => setAddMode("product")}
            >
              Product
            </Button>
            <Button
              type="button"
              variant={addMode === "freeText" ? "primary" : "secondary"}
              aria-pressed={addMode === "freeText"}
              onClick={() => setAddMode("freeText")}
            >
              Free text
            </Button>
          </div>
          {addMode === "product" ? (
            <div className="flex flex-col gap-1">
              <label htmlFor="shopping-add-product" className="text-sm font-medium">
                Product
              </label>
              <select
                id="shopping-add-product"
                className={SELECT_CLASS}
                value={addProductId}
                onChange={(event) => setAddProductId(event.target.value)}
              >
                <option value="">Choose a product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <TextField
              id="shopping-add-text"
              label="What do you need?"
              value={addFreeText}
              onChange={(event) => setAddFreeText(event.target.value)}
            />
          )}
          <TextField
            id="shopping-add-quantity"
            label="Quantity"
            inputMode="numeric"
            value={addQuantity}
            onChange={(event) => setAddQuantity(event.target.value)}
          />
          {formError && dialog === "add" ? (
            <p role="alert" className="text-sm">
              {formError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={pending || (addMode === "product" && addProductId === "")}
            >
              Add
            </Button>
            <Button type="button" variant="secondary" onClick={closeDialog}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={dialog === "putAway"}
        title={`Put away ${activeName}`}
        titleId="shopping-put-away-title"
        onClose={closeDialog}
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submitPutAway();
          }}
        >
          <TextField
            id="shopping-put-away-quantity"
            label="Quantity"
            inputMode="numeric"
            value={putAwayQuantity}
            onChange={(event) => setPutAwayQuantity(event.target.value)}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="shopping-put-away-location" className="text-sm font-medium">
              Location
            </label>
            <select
              id="shopping-put-away-location"
              className={SELECT_CLASS}
              value={putAwayLocationId}
              onChange={(event) => setPutAwayLocationId(event.target.value)}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>
          <TextField
            id="shopping-put-away-expiration"
            label="Expiration date"
            type="date"
            value={putAwayExpiration}
            onChange={(event) => setPutAwayExpiration(event.target.value)}
          />
          {formError && dialog === "putAway" ? (
            <p role="alert" className="text-sm">
              {formError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending || locations.length === 0}>
              Put away
            </Button>
            <Button type="button" variant="secondary" onClick={closeDialog}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={dialog === "consume"}
        title={`Consume ${activeName}`}
        titleId="shopping-consume-title"
        onClose={closeDialog}
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submitConsume();
          }}
        >
          <TextField
            id="shopping-consume-quantity"
            label="Quantity"
            inputMode="numeric"
            value={consumeQuantity}
            onChange={(event) => setConsumeQuantity(event.target.value)}
          />
          {formError && dialog === "consume" ? (
            <p role="alert" className="text-sm">
              {formError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" disabled={pending}>
              Consume
            </Button>
            <Button type="button" variant="secondary" onClick={closeDialog}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
