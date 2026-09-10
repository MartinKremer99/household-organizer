import Link from "next/link";
import { Card } from "@/components/ui/card";
import { requireHouseholdId } from "./load-household";

export default async function SettingsPage() {
  await requireHouseholdId();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      <Link
        href="/settings/products"
        aria-label="Products"
        className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        <Card title="Products">Manage household products.</Card>
      </Link>
      <Link
        href="/settings/categories"
        aria-label="Categories"
        className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        <Card title="Categories">Manage household categories.</Card>
      </Link>
      <Link
        href="/settings/locations"
        aria-label="Locations"
        className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        <Card title="Locations">Manage household locations.</Card>
      </Link>
    </div>
  );
}
