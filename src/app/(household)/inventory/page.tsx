import { InventoryOverviewScreen } from "@/features/inventory/ui/inventory-overview-screen";
import { requireHouseholdId } from "../settings/load-household";

export default async function InventoryPage() {
  const householdId = await requireHouseholdId();
  return <InventoryOverviewScreen householdId={householdId} />;
}
