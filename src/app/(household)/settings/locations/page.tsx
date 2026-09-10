import { LocationsScreen } from "@/features/catalog/ui/locations-screen";
import { requireHouseholdId } from "../load-household";

export default async function SettingsLocationsPage() {
  const householdId = await requireHouseholdId();
  return <LocationsScreen householdId={householdId} />;
}
