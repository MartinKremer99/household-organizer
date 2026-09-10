import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function HomeDashboard() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight">Home</h1>

      <div className="flex flex-col gap-2">
        <Button type="button" variant="primary" disabled>
          Add item
        </Button>
        <p className="text-sm text-foreground/70">
          Adding items is not available yet.
        </p>
      </div>

      <Card title="Low stock">
        <p>Nothing is low.</p>
      </Card>
      <Card title="Expiring soon">
        <p>Nothing is expiring soon.</p>
      </Card>
      <Card title="Purchased waiting to be stored">
        <p>Nothing waiting to be stored.</p>
      </Card>
      <Card title="Quick locations">
        <p>No locations yet.</p>
      </Card>
      <Card title="Shopping overview">
        <p>No active shopping list.</p>
      </Card>
    </div>
  );
}
