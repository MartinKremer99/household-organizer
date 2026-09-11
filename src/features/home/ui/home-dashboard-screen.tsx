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
import { ScanRow } from "./scan-row";

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
  "inline-flex min-h-11 w-full items-center justify-center rounded-control bg-primary px-3 py-2 text-body font-medium text-primary-foreground touch-manipulation focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const FOOTER_LINK_CLASS =
  "inline-flex min-h-11 items-center text-label font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

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
      <p role="alert" className="text-body text-danger">
        {error}
      </p>
    );
  }
  if (section.items.length === 0) {
    return <p className="text-secondary text-muted-foreground">{empty}</p>;
  }
  return render(section.items);
}

function HomeSection({
  title,
  attention,
  children,
}: {
  title: string;
  attention?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={attention ? "border-t border-border pt-4" : undefined}>
      <h2 className="text-section font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
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
    <div className="flex flex-col gap-6">
      <h1 className="text-title font-semibold tracking-tight">Home</h1>
      <Link href="/shopping" className={ADD_ITEM_CLASS}>
        Add item
      </Link>

      {phase === "loading" ? (
        <p role="status" className="text-secondary text-muted-foreground">
          Loading home…
        </p>
      ) : null}

      {phase === "ready" && data ? (
        <>
          <HomeSection title="Low stock" attention>
            {sectionBody(
              data.lowStock,
              "Could not load low stock.",
              "No low-stock items.",
              (items) => (
                <>
                  <p className="text-secondary text-muted-foreground">
                    {items.length} low-stock product{items.length === 1 ? "" : "s"}
                  </p>
                  {addError ? (
                    <p role="alert" className="text-body text-danger">
                      {addError}
                    </p>
                  ) : null}
                  {addSuccess ? (
                    <p role="status" className="text-secondary text-muted-foreground">
                      Added to shopping.
                    </p>
                  ) : null}
                  {preview(items).map((item) => (
                    <div key={item.product_id} className="flex flex-col gap-1">
                      <ScanRow
                        href={`/inventory/${item.product_id}`}
                        name={item.product_name}
                        ariaLabel={item.product_name}
                        value={`${item.current_quantity} / min ${item.minimum_stock}`}
                      />
                      {item.suggested_quantity > 0 ? (
                        <Button
                          variant="secondary"
                          className="w-full"
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
                  <Link href="/inventory" className={FOOTER_LINK_CLASS}>
                    View inventory
                  </Link>
                </>
              ),
            )}
          </HomeSection>

          <HomeSection title="Expiring soon" attention>
            {sectionBody(
              data.expiring,
              "Could not load expiring items.",
              "Nothing expiring soon.",
              (items) => (
                <>
                  <p className="text-secondary text-muted-foreground">
                    {items.length} lot{items.length === 1 ? "" : "s"} expiring soon
                  </p>
                  {preview(items).map((item) => {
                    const relative = expirationRelativeLabel(today, item.expiration_date);
                    return (
                      <ScanRow
                        key={item.lot_id}
                        href={`/inventory/${item.product_id}`}
                        name={item.product_name}
                        ariaLabel={`${item.product_name} · ${item.expiration_date}`}
                        value={String(item.quantity)}
                        details={
                          <>
                            <p className="text-label text-muted-foreground">{item.expiration_date}</p>
                            {relative ? (
                              <p className="text-label font-medium text-warning">{relative}</p>
                            ) : null}
                          </>
                        }
                      />
                    );
                  })}
                  <Link href="/inventory" className={FOOTER_LINK_CLASS}>
                    View inventory
                  </Link>
                </>
              ),
            )}
          </HomeSection>

          <HomeSection title="Purchased waiting to be stored">
            {sectionBody(
              data.purchased,
              "Could not load purchased stock.",
              "Nothing waiting to be stored.",
              (items) => (
                <>
                  <p className="text-secondary text-muted-foreground">{items.length} waiting</p>
                  {preview(items).map((item) => (
                    <ScanRow
                      key={item.product_id}
                      href="/shopping"
                      name={item.product_name}
                      ariaLabel={item.product_name}
                      value={`${item.quantity} remaining`}
                    />
                  ))}
                  <Link href="/shopping" className={FOOTER_LINK_CLASS}>
                    View shopping
                  </Link>
                </>
              ),
            )}
          </HomeSection>

          <HomeSection title="Shopping overview">
            {sectionBody(
              data.shopping,
              "Could not load shopping.",
              "Nothing to buy.",
              (items) => (
                <>
                  <p className="text-secondary text-muted-foreground">{items.length} to buy</p>
                  {preview(items).map((item) => (
                    <ScanRow
                      key={item.id}
                      href="/shopping"
                      name={item.name}
                      ariaLabel={item.name}
                      value={String(item.quantity)}
                    />
                  ))}
                  <Link href="/shopping" className={FOOTER_LINK_CLASS}>
                    View shopping
                  </Link>
                </>
              ),
            )}
          </HomeSection>

          <HomeSection title="Quick locations">
            {sectionBody(
              data.locations,
              "Could not load locations.",
              "No locations yet.",
              (items) => (
                <>
                  {items.map((location) => (
                    <ScanRow
                      key={location.id}
                      href={`/inventory?location=${location.id}`}
                      name={location.name}
                    />
                  ))}
                </>
              ),
            )}
          </HomeSection>
        </>
      ) : null}
    </div>
  );
}
