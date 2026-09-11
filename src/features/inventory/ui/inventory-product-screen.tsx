"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { listActiveLocations } from "@/features/locations/application/manage-locations";
import {
  addInventory,
  moveInventory,
  removeInventory,
} from "@/features/inventory/application/mutate-inventory";
import {
  getProductInventory,
  type InventoryLotView,
  type ProductInventory,
} from "@/features/inventory/application/read-inventory";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { TextField } from "@/components/ui/text-field";
import { todayIsoDate } from "@/lib/domain/inventory/lots";
import { isLowStock } from "@/lib/domain/products/low-stock";
import { expirationRelativeLabel } from "./expiration-copy";
import { inventoryErrorMessage } from "./inventory-errors";

export type InventoryProductScreenApi = {
  getProductInventory: typeof getProductInventory;
  listActiveLocations: typeof listActiveLocations;
  addInventory: typeof addInventory;
  removeInventory: typeof removeInventory;
  moveInventory: typeof moveInventory;
};

type Location = Awaited<ReturnType<InventoryProductScreenApi["listActiveLocations"]>>[number];
type DialogKind = "add" | "remove" | "move" | null;

const defaults: InventoryProductScreenApi = {
  getProductInventory,
  listActiveLocations,
  addInventory,
  removeInventory,
  moveInventory,
};

function parsePositiveInteger(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    return null;
  }
  return Number.parseInt(trimmed, 10);
}

function lotLabel(lot: InventoryLotView): string {
  const location = lot.location_name ?? "Unknown location";
  const expiration = lot.expiration_date ?? "No expiration";
  return `${location} · ${lot.quantity} · ${expiration}`;
}

function firstOtherLocation(locations: Location[], sourceId: string): string {
  return locations.find((row) => row.id !== sourceId)?.id ?? "";
}

function locationQuantity(
  locations: ProductInventory["locations"],
  locationId: string,
): number {
  return locations.find((row) => row.location_id === locationId)?.quantity ?? 0;
}

export function InventoryProductScreen({
  householdId,
  userId,
  productId,
  today = todayIsoDate(),
  api,
}: {
  householdId: string;
  userId: string;
  productId: string;
  today?: string;
  api?: Partial<InventoryProductScreenApi>;
}) {
  const inventory = useMemo(() => ({ ...defaults, ...api }), [api]);
  const locationsLoadedRef = useRef(false);
  const [product, setProduct] = useState<ProductInventory | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [addQuantity, setAddQuantity] = useState("");
  const [addLocationId, setAddLocationId] = useState("");
  const [addExpiration, setAddExpiration] = useState("");
  const [removeQuantity, setRemoveQuantity] = useState("");
  const [removeLocationId, setRemoveLocationId] = useState("");
  const [removeLotId, setRemoveLotId] = useState("");
  const [moveQuantity, setMoveQuantity] = useState("");
  const [moveSourceId, setMoveSourceId] = useState("");
  const [moveDestId, setMoveDestId] = useState("");

  useEffect(() => {
    locationsLoadedRef.current = false;
  }, [householdId]);

  useEffect(() => {
    let cancelled = false;

    const catalogPromise = locationsLoadedRef.current
      ? Promise.resolve(null)
      : inventory.listActiveLocations(householdId);

    void Promise.all([
      inventory.getProductInventory(householdId, productId, { today }),
      catalogPromise,
    ])
      .then(([result, nextLocations]) => {
        if (cancelled) {
          return;
        }
        if (nextLocations) {
          locationsLoadedRef.current = true;
          setLocations(nextLocations);
        }
        if (!result.ok) {
          setMissing(true);
          setProduct(null);
          setError(null);
          return;
        }
        setMissing(false);
        setProduct(result.value);
        setError(null);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setError("Could not load inventory.");
        setMissing(false);
        setProduct(null);
      });

    return () => {
      cancelled = true;
    };
  }, [householdId, inventory, productId, today]);

  const stockedLocations = product?.locations ?? [];
  const lotsAtRemoveLocation = (product?.lots ?? []).filter(
    (lot) => lot.location_id === removeLocationId,
  );
  const selectedRemoveLot =
    lotsAtRemoveLocation.find((lot) => lot.lot_id === removeLotId) ?? null;
  const removeLocationName =
    stockedLocations.find((row) => row.location_id === removeLocationId)?.location_name ??
    "Unknown location";
  const removeMax = selectedRemoveLot
    ? selectedRemoveLot.quantity
    : locationQuantity(stockedLocations, removeLocationId);
  const removeQuantityValue = parsePositiveInteger(removeQuantity);
  const removeBlocked =
    removeMax === 0 ||
    removeQuantityValue === null ||
    removeQuantityValue > removeMax;
  const lotsAtMoveSource = (product?.lots ?? []).filter(
    (lot) => lot.location_id === moveSourceId,
  );
  const moveSourceName =
    stockedLocations.find((row) => row.location_id === moveSourceId)?.location_name ??
    "Unknown location";
  const moveMax = locationQuantity(stockedLocations, moveSourceId);
  const moveQuantityValue = parsePositiveInteger(moveQuantity);
  const sameMoveLocation = Boolean(moveSourceId) && moveSourceId === moveDestId;
  const moveBlocked =
    sameMoveLocation ||
    moveMax === 0 ||
    moveQuantityValue === null ||
    moveQuantityValue > moveMax;

  function closeDialog() {
    if (pending) {
      return;
    }
    setDialog(null);
    setFormError(null);
  }

  function openAdd() {
    setFormError(null);
    setAddQuantity("");
    setAddLocationId(locations[0]?.id ?? "");
    setAddExpiration("");
    setDialog("add");
  }

  function openRemove() {
    setFormError(null);
    setRemoveQuantity("");
    setRemoveLocationId(stockedLocations[0]?.location_id ?? "");
    setRemoveLotId("");
    setDialog("remove");
  }

  function openMove() {
    const source = stockedLocations[0]?.location_id ?? "";
    setFormError(null);
    setMoveQuantity("");
    setMoveSourceId(source);
    setMoveDestId(firstOtherLocation(locations, source));
    setDialog("move");
  }

  async function refreshProduct() {
    const result = await inventory.getProductInventory(householdId, productId, { today });
    if (!result.ok) {
      setMissing(true);
      setProduct(null);
      return;
    }
    setMissing(false);
    setProduct(result.value);
  }

  async function submitAdd() {
    if (pending) {
      return;
    }
    const quantity = parsePositiveInteger(addQuantity);
    if (quantity === null) {
      setFormError(inventoryErrorMessage("invalid_quantity"));
      return;
    }
    setPending(true);
    setFormError(null);
    const result = await inventory.addInventory({
      household_id: householdId,
      user_id: userId,
      product_id: productId,
      location_id: addLocationId,
      quantity,
      ...(addExpiration ? { expiration_date: addExpiration } : {}),
    });
    setPending(false);
    if (!result.ok) {
      setFormError(inventoryErrorMessage(result.code));
      return;
    }
    setDialog(null);
    setFormError(null);
    await refreshProduct();
  }

  async function submitRemove() {
    if (pending) {
      return;
    }
    const quantity = parsePositiveInteger(removeQuantity);
    if (quantity === null || quantity > removeMax || removeMax === 0) {
      return;
    }
    setPending(true);
    setFormError(null);
    const result = await inventory.removeInventory({
      household_id: householdId,
      user_id: userId,
      product_id: productId,
      location_id: removeLocationId,
      quantity,
      ...(removeLotId ? { inventory_lot_id: removeLotId } : {}),
    });
    setPending(false);
    if (!result.ok) {
      setFormError(inventoryErrorMessage(result.code));
      return;
    }
    setDialog(null);
    setFormError(null);
    await refreshProduct();
  }

  async function submitMove() {
    if (pending) {
      return;
    }
    if (sameMoveLocation) {
      setFormError(inventoryErrorMessage("invalid_move"));
      return;
    }
    const quantity = parsePositiveInteger(moveQuantity);
    if (quantity === null || quantity > moveMax || moveMax === 0) {
      return;
    }
    setPending(true);
    setFormError(null);
    const result = await inventory.moveInventory({
      household_id: householdId,
      user_id: userId,
      product_id: productId,
      source_location_id: moveSourceId,
      destination_location_id: moveDestId,
      quantity,
    });
    setPending(false);
    if (!result.ok) {
      setFormError(inventoryErrorMessage(result.code));
      return;
    }
    setDialog(null);
    setFormError(null);
    await refreshProduct();
  }

  const phase =
    error && !product
      ? "error"
      : missing
        ? "missing"
        : product?.product_id === productId
          ? "ready"
          : "loading";

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/inventory"
        className="inline-flex min-h-11 items-center text-label font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Back to inventory
      </Link>

      {phase === "loading" ? (
        <p role="status" className="text-secondary text-muted-foreground">
          Loading inventory…
        </p>
      ) : null}

      {phase === "error" && error ? (
        <p role="alert" className="text-body text-danger">
          {error}
        </p>
      ) : null}

      {phase === "missing" ? (
        <p className="text-secondary text-muted-foreground">
          This product is not in your inventory.
        </p>
      ) : null}

      {phase === "ready" && product ? (
        <>
          <h1 className="text-title font-semibold tracking-tight">
            {product.product_name}
          </h1>
          <p className="text-label text-muted-foreground">
            {product.category_name ?? "Unknown category"}
          </p>
          {product.barcode ? (
            <p className="text-label text-muted-foreground">{product.barcode}</p>
          ) : null}
          <p className="text-numeric font-semibold tabular-nums text-foreground">
            {product.total_quantity === 0
              ? "Out of stock"
              : `Total: ${product.total_quantity}`}
          </p>
          {isLowStock(product.total_quantity, product.minimum_stock) ? (
            <p className="text-label font-medium text-warning">Low stock</p>
          ) : null}
          {product.minimum_stock > 0 ? (
            <p className="text-label text-muted-foreground">Min {product.minimum_stock}</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={openAdd}>
              Add stock
            </Button>
            <Button type="button" variant="secondary" onClick={openMove}>
              Move
            </Button>
            <Button type="button" variant="danger" onClick={openRemove}>
              Remove
            </Button>
          </div>

          <section>
            <h2 className="text-section font-semibold tracking-tight">Locations</h2>
            {product.locations.length === 0 ? (
              <p className="text-secondary text-muted-foreground">
                No stock in any location.
              </p>
            ) : (
              <ul className="flex flex-col">
                {product.locations.map((row) => (
                  <li
                    key={row.location_id}
                    className="flex min-h-11 items-center justify-between gap-3"
                  >
                    <span className="min-w-0 truncate text-card">
                      {`${row.location_name ?? "Unknown location"}: ${row.quantity}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-section font-semibold tracking-tight">Lots</h2>
            {product.lots.length === 0 ? (
              <p className="text-secondary text-muted-foreground">No lots on hand.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {product.lots.map((lot) => {
                  const relative =
                    lot.expiration_date && !lot.expired
                      ? expirationRelativeLabel(today, lot.expiration_date)
                      : null;
                  return (
                    <li key={lot.lot_id}>
                      <p className="text-card">
                        Qty {lot.quantity} at {lot.location_name ?? "Unknown location"}
                      </p>
                      <p className="text-label text-muted-foreground">
                        {lot.expiration_date === null
                          ? "No expiration"
                          : lot.expiration_date}
                      </p>
                      {relative ? (
                        <p className="text-label font-medium text-warning">{relative}</p>
                      ) : null}
                      {lot.expired ? (
                        <p className="text-label font-medium text-danger">Expired</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      ) : null}

      <Dialog
        open={dialog === "add"}
        title="Add stock"
        titleId="inventory-add-title"
        onClose={closeDialog}
      >
        <form
          className="flex min-w-0 flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submitAdd();
          }}
        >
          <TextField
            id="add-quantity"
            label="Quantity"
            inputMode="numeric"
            value={addQuantity}
            onChange={(event) => setAddQuantity(event.target.value)}
          />
          <Select
            id="add-location"
            label="Location"
            value={addLocationId}
            onChange={(event) => setAddLocationId(event.target.value)}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </Select>
          <TextField
            id="add-expiration"
            label="Expiration date"
            type="date"
            value={addExpiration}
            onChange={(event) => setAddExpiration(event.target.value)}
          />
          {formError && dialog === "add" ? (
            <p role="alert" className="text-body text-danger">
              {formError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              Add stock
            </Button>
            <Button type="button" variant="secondary" onClick={closeDialog}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={dialog === "remove"}
        title="Remove"
        titleId="inventory-remove-title"
        onClose={closeDialog}
      >
        <form
          className="flex min-w-0 flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submitRemove();
          }}
        >
          <TextField
            id="remove-quantity"
            label="Quantity"
            inputMode="numeric"
            max={removeMax > 0 ? removeMax : undefined}
            value={removeQuantity}
            onChange={(event) => setRemoveQuantity(event.target.value)}
          />
          {selectedRemoveLot ? (
            <>
              <p>{selectedRemoveLot.quantity} available</p>
              <p>{selectedRemoveLot.expiration_date ?? "No expiration"}</p>
            </>
          ) : (
            <p>
              {removeMax} available at {removeLocationName}
            </p>
          )}
          <Select
            id="remove-location"
            label="Location"
            value={removeLocationId}
            onChange={(event) => {
              setRemoveLocationId(event.target.value);
              setRemoveLotId("");
            }}
          >
            {stockedLocations.map((row) => (
              <option key={row.location_id} value={row.location_id}>
                {row.location_name ?? "Unknown location"}
              </option>
            ))}
          </Select>
          <Select
            id="remove-lot"
            label="Lot"
            value={removeLotId}
            onChange={(event) => setRemoveLotId(event.target.value)}
          >
            <option value="">Any lot (oldest first)</option>
            {lotsAtRemoveLocation.map((lot) => (
              <option key={lot.lot_id} value={lot.lot_id}>
                {lotLabel(lot)}
              </option>
            ))}
          </Select>
          {formError && dialog === "remove" ? (
            <p role="alert" className="text-body text-danger">
              {formError}
            </p>
          ) : removeQuantityValue != null && removeQuantityValue > removeMax ? (
            <p role="alert" className="text-body text-danger">
              {inventoryErrorMessage("insufficient_stock")}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" disabled={pending || removeBlocked}>
              Remove
            </Button>
            <Button type="button" variant="secondary" onClick={closeDialog}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={dialog === "move"}
        title="Move"
        titleId="inventory-move-title"
        onClose={closeDialog}
      >
        <form
          className="flex min-w-0 flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submitMove();
          }}
        >
          <TextField
            id="move-quantity"
            label="Quantity"
            inputMode="numeric"
            max={moveMax > 0 ? moveMax : undefined}
            value={moveQuantity}
            onChange={(event) => setMoveQuantity(event.target.value)}
          />
          <p>
            {moveMax} available at {moveSourceName}
          </p>
          <p>Oldest lots are used first.</p>
          {lotsAtMoveSource.map((lot) => (
            <div key={lot.lot_id}>
              <p>{lot.quantity}</p>
              <p>{lot.expiration_date ?? "No expiration"}</p>
            </div>
          ))}
          <Select
            id="move-source"
            label="Source"
            value={moveSourceId}
            onChange={(event) => {
              const nextSource = event.target.value;
              setMoveSourceId(nextSource);
              if (moveDestId === nextSource) {
                setMoveDestId(firstOtherLocation(locations, nextSource));
              }
            }}
          >
            {stockedLocations.map((row) => (
              <option key={row.location_id} value={row.location_id}>
                {row.location_name ?? "Unknown location"}
              </option>
            ))}
          </Select>
          <Select
            id="move-destination"
            label="Destination"
            value={moveDestId}
            onChange={(event) => setMoveDestId(event.target.value)}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </Select>
          {sameMoveLocation || (formError && dialog === "move") ? (
            <p role="alert" className="text-body text-danger">
              {formError ?? inventoryErrorMessage("invalid_move")}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending || moveBlocked}>
              Move
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
