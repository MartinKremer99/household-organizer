import { CategoriesScreen } from "@/features/catalog/ui/categories-screen";
import { requireHouseholdId } from "../load-household";

export default async function SettingsCategoriesPage() {
  const householdId = await requireHouseholdId();
  return <CategoriesScreen householdId={householdId} />;
}
