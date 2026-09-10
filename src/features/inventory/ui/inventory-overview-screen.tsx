"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { listActiveCategories } from "@/features/categories/application/manage-categories";
import {
  listInventoryOverview,
  type InventoryOverviewFilters,
  type InventoryOverviewItem,
} from "@/features/inventory/application/read-inventory";
import { listActiveLocations } from "@/features/locations/application/manage-locations";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { isLowStock } from "@/lib/domain/products/low-stock";

export type InventoryOverviewScreenApi = {
  listInventoryOverview: typeof listInventoryOverview;
  listActiveCategories: typeof listActiveCategories;
  listActiveLocations: typeof listActiveLocations;
};

type Category = Awaited<ReturnType<InventoryOverviewScreenApi["listActiveCategories"]>>[number];
type Location = Awaited<ReturnType<InventoryOverviewScreenApi["listActiveLocations"]>>[number];

const defaults: InventoryOverviewScreenApi = {
  listInventoryOverview,
  listActiveCategories,
  listActiveLocations,
};

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

export function InventoryOverviewScreen({
  householdId,
  api,
}: {
  householdId: string;
  api?: Partial<InventoryOverviewScreenApi>;
}) {
  const inventory = useMemo(() => ({ ...defaults, ...api }), [api]);
  const catalogLoadedRef = useRef(false);
  const [items, setItems] = useState<InventoryOverviewItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight">Inventory</h1>

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
            className="min-h-11 rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
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
            className="min-h-11 rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
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
        <p className="text-sm text-foreground/80">
          {filtersActive ? "No products match these filters." : "No products yet."}
        </p>
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
    </div>
  );
}
