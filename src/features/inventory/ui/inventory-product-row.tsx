import Link from "next/link";
import { isLowStock } from "@/lib/domain/products/low-stock";
import type { InventoryOverviewItem } from "@/features/inventory/application/read-inventory";

function locationLine(item: InventoryOverviewItem): string {
  return item.locations
    .map((row) => `${row.location_name ?? "Unknown location"} ${row.quantity}`)
    .join(" · ");
}

export function InventoryProductRow({ item }: { item: InventoryOverviewItem }) {
  const stock =
    item.total_quantity === 0 ? "Out of stock" : `${item.total_quantity} in stock`;
  const locations = locationLine(item);
  const low = isLowStock(item.total_quantity, item.minimum_stock);

  return (
    <Link
      href={`/inventory/${item.product_id}`}
      aria-label={item.product_name}
      className="block min-h-11 min-w-0 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <div className="flex min-h-11 min-w-0 items-start justify-between gap-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-card font-medium">{item.product_name}</p>
          <p className="text-label text-muted-foreground">
            {item.category_name ?? "Unknown category"}
          </p>
          {item.minimum_stock > 0 ? (
            <p className="text-label text-muted-foreground">Min {item.minimum_stock}</p>
          ) : null}
          {low ? <p className="text-label font-medium text-warning">Low stock</p> : null}
          {locations ? <p className="text-label text-muted-foreground">{locations}</p> : null}
        </div>
        <p className="shrink-0 text-numeric font-semibold tabular-nums text-foreground">
          {stock}
        </p>
      </div>
    </Link>
  );
}
