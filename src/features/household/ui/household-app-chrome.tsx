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
import { getLocalHousehold } from "@/features/household/application/manage-household";
import { HouseholdHydrationGate } from "@/features/household/ui/household-hydration-gate";

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
}: {
  userId: string;
  status?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [name, setName] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const local = await getLocalHousehold();
    setName(local?.name ?? null);
  }, []);
  const onReady = useCallback((household: { name: string }) => {
    setName(household.name);
  }, []);
  const value = useMemo(() => refresh, [refresh]);

  return (
    <HouseholdNameRefreshContext.Provider value={value}>
      <AppShell identity={name} status={status} actions={actions}>
        <HouseholdHydrationGate userId={userId} onReady={onReady}>
          {children}
        </HouseholdHydrationGate>
      </AppShell>
    </HouseholdNameRefreshContext.Provider>
  );
}
