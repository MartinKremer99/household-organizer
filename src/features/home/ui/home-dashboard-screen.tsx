"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  loadHomeDashboard,
  type HomeDashboardApi,
  type HomeDashboardData,
  type Section,
} from "@/features/home/application/load-home-dashboard";
import { listExpiringInventory, listLowStockInventory } from "@/features/inventory/application/read-inventory";
import { listActiveLocations } from "@/features/locations/application/manage-locations";
import { listActiveProducts } from "@/features/products/application/manage-products";
import {
  addProductShoppingItem,
  listPendingShoppingItems,
  listPurchasedStock,
} from "@/features/shopping/application/manage-shopping";
import { shoppingErrorMessage } from "@/features/shopping/ui/shopping-errors";
import { expirationRelativeLabel } from "@/features/inventory/ui/expiration-copy";
import { todayIsoDate } from "@/lib/domain/inventory/lots";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type HomeDashboardScreenApi = HomeDashboardApi & {
  addProductShoppingItem: typeof addProductShoppingItem;
};

const defaults: HomeDashboardScreenApi = {
  listLowStockInventory,
  listExpiringInventory,
  listPendingShoppingItems,
  listPurchasedStock,
  listActiveLocations,
  listActiveProducts,
  addProductShoppingItem,
};

const PREVIEW = 5;

const ADD_ITEM_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

const ROW_LINK_CLASS =
  "block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

function preview<T>(items: T[]): T[] {
  return items.slice(0, PREVIEW);
}

function sectionBody<T>(
  section: Section<T[]>,
  error: string,
  empty: string,
  render: (items: T[]) => ReactNode,
) {
  if (!section.ok) {
    return (
      <p role="alert" className="text-sm">
        {error}
      </p>
    );
  }
  if (section.items.length === 0) {
    return <p>{empty}</p>;
  }
  return render(section.items);
}

export function HomeDashboardScreen({
  householdId,
  userId,
  today = todayIsoDate(),
  api,
}: {
  householdId: string;
  userId: string;
  today?: string;
  api?: Partial<HomeDashboardScreenApi>;
}) {
  const dashboard = useMemo(() => ({ ...defaults, ...api }), [api]);
  const [data, setData] = useState<HomeDashboardData | null>(null);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void loadHomeDashboard(householdId, { api: dashboard }).then((next) => {
      if (!cancelled) {
        setData(next);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [dashboard, householdId]);

  async function addSuggested(item: {
    product_id: string;
    suggested_quantity: number;
  }) {
    setAddingProductId(item.product_id);
    setAddError(null);
    setAddSuccess(false);
    try {
      const result = await dashboard.addProductShoppingItem({
        household_id: householdId,
        user_id: userId,
        product_id: item.product_id,
        quantity: item.suggested_quantity,
      });
      if (!result.ok) {
        setAddError(shoppingErrorMessage(result.code));
        return;
      }
      setAddSuccess(true);
      const next = await loadHomeDashboard(householdId, { api: dashboard });
      setData(next);
    } finally {
      setAddingProductId(null);
    }
  }

  const phase = data ? "ready" : "loading";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight">Home</h1>
      <Link href="/shopping" className={ADD_ITEM_CLASS}>
        Add item
      </Link>

      {phase === "loading" ? (
        <p role="status" className="text-sm">
          Loading home…
        </p>
      ) : null}

      {phase === "ready" && data ? (
        <>
          <Card title="Low stock">
            {sectionBody(
              data.lowStock,
              "Could not load low stock.",
              "No low-stock items.",
              (items) => (
                <>
                  <p>
                    {items.length} low-stock product{items.length === 1 ? "" : "s"}
                  </p>
                  {addError ? (
                    <p role="alert" className="text-sm">
                      {addError}
                    </p>
                  ) : null}
                  {addSuccess ? (
                    <p role="status" className="text-sm">
                      Added to shopping.
                    </p>
                  ) : null}
                  {preview(items).map((item) => (
                    <div key={item.product_id}>
                      <Link
                        href={`/inventory/${item.product_id}`}
                        aria-label={item.product_name}
                        className={ROW_LINK_CLASS}
                      >
                        <p>{item.product_name}</p>
                        <p>
                          {item.current_quantity} / min {item.minimum_stock}
                        </p>
                      </Link>
                      {item.suggested_quantity > 0 ? (
                        <Button
                          variant="secondary"
                          disabled={addingProductId === item.product_id}
                          aria-busy={addingProductId === item.product_id}
                          aria-label={`Add ${item.suggested_quantity} ${item.product_name} to shopping`}
                          onClick={() => {
                            void addSuggested(item);
                          }}
                        >
                          Add {item.suggested_quantity} to shopping
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  <Link href="/inventory" className="underline">
                    View inventory
                  </Link>
                </>
              ),
            )}
          </Card>

          <Card title="Expiring soon">
            {sectionBody(
              data.expiring,
              "Could not load expiring items.",
              "Nothing expiring soon.",
              (items) => (
                <>
                  <p>
                    {items.length} lot{items.length === 1 ? "" : "s"} expiring soon
                  </p>
                  {preview(items).map((item) => {
                    const relative = expirationRelativeLabel(today, item.expiration_date);
                    return (
                      <Link
                        key={item.lot_id}
                        href={`/inventory/${item.product_id}`}
                        aria-label={`${item.product_name} · ${item.expiration_date}`}
                        className={ROW_LINK_CLASS}
                      >
                        <p>{item.product_name}</p>
                        <p>{item.quantity}</p>
                        <p>{item.expiration_date}</p>
                        {relative ? <p>{relative}</p> : null}
                      </Link>
                    );
                  })}
                  <Link href="/inventory" className="underline">
                    View inventory
                  </Link>
                </>
              ),
            )}
          </Card>

          <Card title="Purchased waiting to be stored">
            {sectionBody(
              data.purchased,
              "Could not load purchased stock.",
              "Nothing waiting to be stored.",
              (items) => (
                <>
                  <p>{items.length} waiting</p>
                  {preview(items).map((item) => (
                    <Link
                      key={item.product_id}
                      href="/shopping"
                      aria-label={item.product_name}
                      className={ROW_LINK_CLASS}
                    >
                      <p>{item.product_name}</p>
                      <p>{item.quantity} remaining</p>
                    </Link>
                  ))}
                  <Link href="/shopping" className="underline">
                    View shopping
                  </Link>
                </>
              ),
            )}
          </Card>

          <Card title="Shopping overview">
            {sectionBody(
              data.shopping,
              "Could not load shopping.",
              "Nothing to buy.",
              (items) => (
                <>
                  <p>{items.length} to buy</p>
                  {preview(items).map((item) => (
                    <Link key={item.id} href="/shopping" aria-label={item.name} className={ROW_LINK_CLASS}>
                      <p>{item.name}</p>
                      <p>{item.quantity}</p>
                    </Link>
                  ))}
                  <Link href="/shopping" className="underline">
                    View shopping
                  </Link>
                </>
              ),
            )}
          </Card>

          <Card title="Quick locations">
            {sectionBody(
              data.locations,
              "Could not load locations.",
              "No locations yet.",
              (items) => (
                <>
                  {items.map((location) => (
                    <Link
                      key={location.id}
                      href={`/inventory?location=${location.id}`}
                      className={ROW_LINK_CLASS}
                    >
                      {location.name}
                    </Link>
                  ))}
                </>
              ),
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
