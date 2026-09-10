"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  ensureLocalHousehold,
  type EnsureLocalHouseholdResult,
} from "@/features/household/application/hydrate-household";

export type HouseholdHydrationGateApi = {
  ensureLocalHousehold: typeof ensureLocalHousehold;
};

const defaults: HouseholdHydrationGateApi = {
  ensureLocalHousehold,
};

export function HouseholdHydrationGate({
  userId,
  children,
  api,
  onReady,
}: {
  userId: string;
  children: ReactNode;
  api?: Partial<HouseholdHydrationGateApi>;
  onReady?: (household: { name: string }) => void;
}) {
  const ensure = api?.ensureLocalHousehold ?? defaults.ensureLocalHousehold;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<EnsureLocalHouseholdResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void ensure({ userId }).then((next) => {
      if (!cancelled) {
        setResult(next);
        if (next.ok) {
          onReady?.(next.household);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ensure, userId, attempt, onReady]);

  if (result?.ok) {
    return children;
  }

  if (result && !result.ok) {
    return (
      <div className="space-y-3 p-4">
        <p role="status">Could not load household</p>
        <Button
          type="button"
          onClick={() => {
            setResult(null);
            setAttempt((current) => current + 1);
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <p role="status" className="p-4">
      Loading household…
    </p>
  );
}
