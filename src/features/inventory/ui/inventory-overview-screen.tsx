"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { listActiveCategories } from "@/features/categories/application/manage-categories";
import { catalogErrorMessage } from "@/features/catalog/ui/catalog-errors";
import {
  listInventoryOverview,
  type InventoryOverviewFilters,
  type InventoryOverviewItem,
} from "@/features/inventory/application/read-inventory";
import { listActiveLocations } from "@/features/locations/application/manage-locations";
import { ProductBarcodeFields } from "@/features/barcode/ui/product-barcode-fields";
import { createProduct } from "@/features/products/application/manage-products";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/text-field";
import { isLowStock } from "@/lib/domain/products/low-stock";

export type InventoryOverviewScreenApi = {
  listInventoryOverview: typeof listInventoryOverview;
  listActiveCategories: typeof listActiveCategories;
  listActiveLocations: typeof listActiveLocations;
  createProduct: typeof createProduct;
};

export type InventoryOverviewScreenProps = {
  householdId: string;
  initialLocationId?: string;
  onProductCreated?: (productId: string) => void;
  api?: Partial<InventoryOverviewScreenApi>;
};

type Category = Awaited<ReturnType<InventoryOverviewScreenApi["listActiveCategories"]>>[number];
type Location = Awaited<ReturnType<InventoryOverviewScreenApi["listActiveLocations"]>>[number];
type CreateEditor = {
  name: string;
  categoryId: string;
  minimumStock: string;
  barcode: string;
};

const defaults: InventoryOverviewScreenApi = {
  listInventoryOverview,
  listActiveCategories,
  listActiveLocations,
  createProduct,
};

const SELECT_CLASS =
  "min-h-11 rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

function buildFilters(
  query: string,
  categoryId: string,
  locationId: string,
): InventoryOverviewFilters | undefined {
  const filters: InventoryOverviewFilters = {};
  if (query.trim()) {
    filters.query = query;
  }
  if (categoryId) {
    filters.category_id = categoryId;
  }
  if (locationId) {
    filters.location_id = locationId;
  }
  return Object.keys(filters).length > 0 ? filters : undefined;
}

function locationLine(item: InventoryOverviewItem): string {
  return item.locations
    .map((row) => `${row.location_name ?? "Unknown location"} ${row.quantity}`)
    .join(" · ");
}

function CategoryRequiredHint() {
  return (
    <p className="text-sm text-foreground/70">
      A category is required.{" "}
      <Link href="/settings/categories" className="underline">
        Settings → Categories
      </Link>
    </p>
  );
}

export function InventoryOverviewScreen({
  householdId,
  initialLocationId,
  onProductCreated,
  api,
}: InventoryOverviewScreenProps) {
  const inventory = useMemo(() => ({ ...defaults, ...api }), [api]);
  const catalogLoadedRef = useRef(false);
  const [items, setItems] = useState<InventoryOverviewItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [locationId, setLocationId] = useState(initialLocationId ?? "");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<CreateEditor | null>(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    catalogLoadedRef.current = false;
  }, [householdId]);

  useEffect(() => {
    let cancelled = false;

    const filters = buildFilters(query, categoryId, locationId);
    const overviewPromise = filters
      ? inventory.listInventoryOverview(householdId, filters)
      : inventory.listInventoryOverview(householdId);

    const catalogPromise = catalogLoadedRef.current
      ? Promise.resolve(null)
      : Promise.all([
          inventory.listActiveCategories(householdId),
          inventory.listActiveLocations(householdId),
        ]);

    void Promise.all([overviewPromise, catalogPromise])
      .then(([nextItems, catalog]) => {
        if (cancelled) {
          return;
        }
        if (catalog) {
          catalogLoadedRef.current = true;
          setCategories(catalog[0]);
          setLocations(catalog[1]);
        }
        setItems(nextItems);
        setError(null);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setError("Could not load inventory.");
        setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [categoryId, householdId, inventory, locationId, query]);

  const phase = error ? "error" : loaded ? "ready" : "loading";

  const filtersActive = Boolean(query.trim() || categoryId || locationId);
  const showHeaderAdd = phase === "ready" && items.length > 0;
  const noCategories = categories.length === 0;

  function openCreate() {
    setFormError(null);
    setEditor({
      name: "",
      categoryId: categories[0]?.id ?? "",
      minimumStock: "0",
      barcode: "",
    });
  }

  async function handleCreate() {
    if (!editor || pending || noCategories) {
      return;
    }

    setPending(true);
    setFormError(null);

    const result = await inventory.createProduct({
      household_id: householdId,
      name: editor.name,
      category_id: editor.categoryId,
      minimum_stock: Number(editor.minimumStock),
      barcode: editor.barcode.trim() === "" ? null : editor.barcode,
    });

    if (!result.ok) {
      setPending(false);
      setFormError(catalogErrorMessage(result.code));
      return;
    }

    setPending(false);
    setEditor(null);

    const filters = buildFilters(query, categoryId, locationId);
    try {
      const nextItems = filters
        ? await inventory.listInventoryOverview(householdId, filters)
        : await inventory.listInventoryOverview(householdId);
      setItems(nextItems);
      setError(null);
    } catch {
      setError("Could not load inventory.");
    }

    onProductCreated?.(result.value.id);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight">Inventory</h1>

      {showHeaderAdd ? (
        <div className="flex flex-col gap-2">
          <Button type="button" onClick={openCreate}>
            Add product
          </Button>
          {noCategories ? <CategoryRequiredHint /> : null}
        </div>
      ) : null}

      <TextField
        id="inventory-search"
        label="Search products"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="inventory-category" className="text-sm font-medium">
            Category
          </label>
          <select
            id="inventory-category"
            className={SELECT_CLASS}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="inventory-location" className="text-sm font-medium">
            Location
          </label>
          <select
            id="inventory-location"
            className={SELECT_CLASS}
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          >
            <option value="">All locations</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtersActive ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setQuery("");
            setCategoryId("");
            setLocationId("");
          }}
        >
          Clear filters
        </Button>
      ) : null}

      {phase === "loading" ? (
        <p role="status" className="text-sm">
          Loading inventory…
        </p>
      ) : null}

      {phase === "error" && error ? (
        <p role="alert" className="text-sm">
          {error}
        </p>
      ) : null}

      {phase === "ready" && items.length === 0 ? (
        filtersActive ? (
          <p className="text-sm text-foreground/80">No products match these filters.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-foreground/80">No products yet.</p>
            <Button type="button" onClick={openCreate}>
              Add product
            </Button>
            {noCategories ? <CategoryRequiredHint /> : null}
          </div>
        )
      ) : null}

      {phase === "ready"
        ? items.map((item) => (
            <Link
              key={item.product_id}
              href={`/inventory/${item.product_id}`}
              aria-label={item.product_name}
              className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              <Card title={item.product_name}>
                <p>{item.category_name ?? "Unknown category"}</p>
                <p>
                  {item.total_quantity === 0
                    ? "Out of stock"
                    : `${item.total_quantity} in stock`}
                </p>
                {item.minimum_stock > 0 ? <p>Min {item.minimum_stock}</p> : null}
                {isLowStock(item.total_quantity, item.minimum_stock) ? (
                  <p>Low stock</p>
                ) : null}
                {locationLine(item) ? <p>{locationLine(item)}</p> : null}
              </Card>
            </Link>
          ))
        : null}

      <Dialog
        open={editor !== null}
        title="Add product"
        titleId="inventory-create-product-title"
        onClose={() => {
          setEditor(null);
        }}
      >
        {editor ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreate();
            }}
          >
            <TextField
              id="inventory-create-name"
              label="Name"
              required
              value={editor.name}
              onChange={(event) =>
                setEditor({ ...editor, name: event.target.value })
              }
            />
            <ProductBarcodeFields
              barcode={editor.barcode}
              name={editor.name}
              onBarcodeChange={(barcode) => setEditor({ ...editor, barcode })}
              onNameChange={(name) => setEditor({ ...editor, name })}
            />
            <div className="flex flex-col gap-1">
              <label htmlFor="inventory-create-category" className="text-sm font-medium">
                Category
              </label>
              <select
                id="inventory-create-category"
                className={SELECT_CLASS}
                required={!noCategories}
                value={editor.categoryId}
                onChange={(event) =>
                  setEditor({ ...editor, categoryId: event.target.value })
                }
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <TextField
              id="inventory-create-minimum-stock"
              label="Minimum stock"
              type="number"
              step="1"
              value={editor.minimumStock}
              onChange={(event) =>
                setEditor({ ...editor, minimumStock: event.target.value })
              }
            />
            {noCategories ? <CategoryRequiredHint /> : null}
            {formError ? (
              <p role="alert" className="text-sm">
                {formError}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending || noCategories}>
                Save
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditor(null)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>
    </div>
  );
}

export function InventoryOverviewRoute(
  props: Omit<InventoryOverviewScreenProps, "onProductCreated">,
) {
  const router = useRouter();
  return (
    <InventoryOverviewScreen
      {...props}
      onProductCreated={(id) => router.push(`/inventory/${id}`)}
    />
  );
}
