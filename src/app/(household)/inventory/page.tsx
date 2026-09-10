import { InventoryOverviewScreen } from "@/features/inventory/ui/inventory-overview-screen";
import { requireHouseholdId } from "../settings/load-household";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string | string[] }>;
}) {
  const householdId = await requireHouseholdId();
  const raw = (await searchParams).location;
  const location = Array.isArray(raw) ? raw[0] : raw;
  return (
    <InventoryOverviewScreen
      key={location ?? ""}
      householdId={householdId}
      initialLocationId={typeof location === "string" && location !== "" ? location : undefined}
    />
  );
}
