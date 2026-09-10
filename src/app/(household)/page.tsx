import { HomeDashboardScreen } from "@/features/home/ui/home-dashboard-screen";
import { requireHouseholdActor } from "./settings/load-household";

export default async function HomePage() {
  const { householdId, userId } = await requireHouseholdActor();
  return <HomeDashboardScreen householdId={householdId} userId={userId} />;
}
