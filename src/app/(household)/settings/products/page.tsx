import { ProductsScreen } from "@/features/catalog/ui/products-screen";
import { requireHouseholdId } from "../load-household";

export default async function SettingsProductsPage() {
  const householdId = await requireHouseholdId();
  return <ProductsScreen householdId={householdId} />;
}
