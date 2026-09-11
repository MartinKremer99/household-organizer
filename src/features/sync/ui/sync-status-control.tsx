"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { evaluateHouseholdNotifications } from "@/features/notifications/application/evaluate-notifications";
import { loadSyncStatus, type SyncStatusView } from "@/features/sync/application/load-sync-status";
import { runHouseholdSync } from "@/features/sync/application/run-household-sync";
import { Button } from "@/components/ui/button";
import { syncStatusErrorMessage } from "./sync-errors";

export type SyncStatusControlApi = {
  loadSyncStatus: typeof loadSyncStatus;
  runHouseholdSync: typeof runHouseholdSync;
  evaluateHouseholdNotifications: typeof evaluateHouseholdNotifications;
};

const defaults: SyncStatusControlApi = {
  loadSyncStatus,
  runHouseholdSync,
  evaluateHouseholdNotifications,
};

const LABELS: Record<SyncStatusView["label"], string> = {
  never_synced: "Never synced",
  synced: "Synced",
  pending: "Pending changes",
  failed: "Sync failed",
};

const EMPTY: SyncStatusView = {
  label: "never_synced",
  last_sync_at: null,
  error_kind: null,
  error_code: null,
};

function formatLastSynced(iso: string): string {
  return `Last synced ${iso.slice(0, 16).replace("T", " ")}`;
}

export function SyncStatusControl({
  householdId,
  api,
}: {
  householdId: string;
  api?: Partial<SyncStatusControlApi>;
}) {
  const pathname = usePathname();
  const client = useMemo(() => ({ ...defaults, ...api }), [api]);
  const [view, setView] = useState<SyncStatusView | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void client.loadSyncStatus(householdId).then(
      (next) => {
        if (!cancelled) {
          setView(next);
        }
      },
      () => {
        if (!cancelled) {
          setView((current) => current ?? EMPTY);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [client, householdId, pathname]);

  async function onSyncNow() {
    setSyncing(true);
    try {
      await client.runHouseholdSync();
      const next = await client.loadSyncStatus(householdId);
      setView(next);
      await client.evaluateHouseholdNotifications(householdId);
    } catch {
      setView((current) => current ?? EMPTY);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      {syncing ? (
        <p className="text-xs" role="status">
          Syncing…
        </p>
      ) : view ? (
        <p className="text-xs">{LABELS[view.label]}</p>
      ) : null}
      {!syncing && view?.last_sync_at ? (
        <p className="text-xs text-foreground/70">{formatLastSynced(view.last_sync_at)}</p>
      ) : null}
      {!syncing && view?.label === "failed" ? (
        <p className="text-xs text-foreground/70">
          {syncStatusErrorMessage({ kind: view.error_kind, code: view.error_code })}
        </p>
      ) : null}
      <Button
        variant="secondary"
        disabled={syncing}
        aria-busy={syncing}
        onClick={() => {
          void onSyncNow();
        }}
      >
        Sync now
      </Button>
    </div>
  );
}
