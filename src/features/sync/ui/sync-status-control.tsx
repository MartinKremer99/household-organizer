"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
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
  const detailId = useId();
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

  const lastSynced = !syncing && view?.last_sync_at ? formatLastSynced(view.last_sync_at) : null;
  const failure =
    !syncing && view?.label === "failed"
      ? syncStatusErrorMessage({ kind: view.error_kind, code: view.error_code })
      : null;
  const detailIds = [lastSynced ? `${detailId}-synced` : null, failure ? `${detailId}-error` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex shrink-0 items-center gap-2">
      {syncing ? (
        <p className="text-secondary text-muted-foreground" role="status">
          Syncing…
        </p>
      ) : view ? (
        <p
          className="text-secondary text-muted-foreground"
          role="status"
          aria-describedby={detailIds || undefined}
        >
          {LABELS[view.label]}
        </p>
      ) : null}
      {lastSynced ? (
        <p id={`${detailId}-synced`} className="sr-only">
          {lastSynced}
        </p>
      ) : null}
      {failure ? (
        <p id={`${detailId}-error`} className="sr-only">
          {failure}
        </p>
      ) : null}
      <Button
        variant="secondary"
        disabled={syncing}
        aria-busy={syncing}
        aria-describedby={detailIds || undefined}
        onClick={() => {
          void onSyncNow();
        }}
      >
        Sync now
      </Button>
    </div>
  );
}
