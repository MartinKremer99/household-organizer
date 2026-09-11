"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppShell } from "@/components/layout/app-shell";
import {
  ensureLocalHousehold,
  type EnsureLocalHouseholdOptions,
  type EnsureLocalHouseholdResult,
} from "@/features/household/application/hydrate-household";
import { getLocalHousehold } from "@/features/household/application/manage-household";
import { evaluateHouseholdNotifications } from "@/features/notifications/application/evaluate-notifications";
import { HouseholdHydrationGate } from "@/features/household/ui/household-hydration-gate";

export type HouseholdAppChromeApi = {
  ensureLocalHousehold: (
    options: EnsureLocalHouseholdOptions,
  ) => Promise<EnsureLocalHouseholdResult>;
  evaluateHouseholdNotifications: typeof evaluateHouseholdNotifications;
};

const defaults: HouseholdAppChromeApi = {
  ensureLocalHousehold,
  evaluateHouseholdNotifications,
};

const HouseholdNameRefreshContext = createContext<(() => Promise<void>) | null>(
  null,
);

export function useHouseholdNameRefresh(): () => Promise<void> {
  return useContext(HouseholdNameRefreshContext) ?? (async () => undefined);
}

export function HouseholdAppChrome({
  userId,
  status,
  actions,
  children,
  api,
}: {
  userId: string;
  status?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  api?: Partial<HouseholdAppChromeApi>;
}) {
  const evaluate = api?.evaluateHouseholdNotifications ?? defaults.evaluateHouseholdNotifications;
  const ensure = api?.ensureLocalHousehold ?? defaults.ensureLocalHousehold;
  const [name, setName] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const local = await getLocalHousehold();
    setName(local?.name ?? null);
  }, []);
  const onReady = useCallback(
    (household: { id: string; name: string }) => {
      setName(household.name);
      void evaluate(household.id);
    },
    [evaluate],
  );
  const value = useMemo(() => refresh, [refresh]);

  return (
    <HouseholdNameRefreshContext.Provider value={value}>
      <AppShell identity={name} status={status} actions={actions}>
        <HouseholdHydrationGate
          userId={userId}
          onReady={onReady}
          api={{ ensureLocalHousehold: ensure }}
        >
          {children}
        </HouseholdHydrationGate>
      </AppShell>
    </HouseholdNameRefreshContext.Provider>
  );
}
