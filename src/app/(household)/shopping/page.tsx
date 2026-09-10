import { ShoppingOverviewScreen } from "@/features/shopping/ui/shopping-overview-screen";
import { requireHouseholdActor } from "../settings/load-household";

export default async function ShoppingPage() {
  const { householdId, userId } = await requireHouseholdActor();
  return <ShoppingOverviewScreen householdId={householdId} userId={userId} />;
}
