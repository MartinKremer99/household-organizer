import { InventoryProductScreen } from "@/features/inventory/ui/inventory-product-screen";
import { requireHouseholdActor } from "../../settings/load-household";

export default async function InventoryProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { householdId, userId } = await requireHouseholdActor();
  const { productId } = await params;
  return (
    <InventoryProductScreen
      householdId={householdId}
      userId={userId}
      productId={productId}
    />
  );
}
