/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncStatusView } from "@/features/sync/application/load-sync-status";
import { SyncStatusControl, type SyncStatusControlApi } from "./sync-status-control";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}));

const HOUSEHOLD = "household-a";

const neverSynced: SyncStatusView = {
  label: "never_synced",
  last_sync_at: null,
  error_kind: null,
  error_code: null,
};

const synced: SyncStatusView = {
  label: "synced",
  last_sync_at: "2026-09-09T10:00:00.000Z",
  error_kind: null,
  error_code: null,
};

const pending: SyncStatusView = {
  label: "pending",
  last_sync_at: "2026-09-09T10:00:00.000Z",
  error_kind: null,
  error_code: null,
};

const failedBusiness: SyncStatusView = {
  label: "failed",
  last_sync_at: "2026-09-08T09:15:00.000Z",
  error_kind: "business",
  error_code: "insufficient_stock",
};

const failedTransient: SyncStatusView = {
  label: "failed",
  last_sync_at: null,
  error_kind: "transient",
  error_code: "transient_error",
};

function api(overrides: Partial<SyncStatusControlApi> = {}): SyncStatusControlApi {
  return {
    loadSyncStatus: vi.fn().mockResolvedValue(neverSynced),
    runHouseholdSync: vi.fn().mockResolvedValue(undefined),
    evaluateHouseholdNotifications: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderControl(control: SyncStatusControlApi = api()) {
  return render(<SyncStatusControl householdId={HOUSEHOLD} api={control} />);
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.mocked(usePathname).mockReturnValue("/");
});

describe("SyncStatusControl", () => {
  it("renders the never-synced state", async () => {
    renderControl();

    expect(await screen.findByText("Never synced")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sync now" })).toBeTruthy();
  });

  it("renders synced state and last successful timestamp", async () => {
    renderControl(api({ loadSyncStatus: vi.fn().mockResolvedValue(synced) }));

    expect(await screen.findByText("Synced")).toBeTruthy();
    expect(screen.getByText("Last synced 2026-09-09 10:00")).toBeTruthy();
  });

  it("renders pending changes", async () => {
    renderControl(api({ loadSyncStatus: vi.fn().mockResolvedValue(pending) }));

    expect(await screen.findByText("Pending changes")).toBeTruthy();
    expect(screen.getByText("Last synced 2026-09-09 10:00")).toBeTruthy();
  });

  it("renders failed state with mapped copy and no raw code", async () => {
    renderControl(api({ loadSyncStatus: vi.fn().mockResolvedValue(failedBusiness) }));

    expect(await screen.findByText("Sync failed")).toBeTruthy();
    expect(
      screen.getByText("Could not apply a change. Check quantities and try again."),
    ).toBeTruthy();
    expect(screen.getByText("Last synced 2026-09-08 09:15")).toBeTruthy();
    expect(screen.queryByText(/insufficient_stock/)).toBeNull();
  });

  it("reloads status when the pathname changes", async () => {
    const loadSyncStatus = vi.fn().mockResolvedValue(neverSynced);
    const { rerender } = renderControl(api({ loadSyncStatus }));

    await screen.findByText("Never synced");
    expect(loadSyncStatus).toHaveBeenCalledTimes(1);

    vi.mocked(usePathname).mockReturnValue("/shopping");
    rerender(
      <SyncStatusControl
        householdId={HOUSEHOLD}
        api={api({ loadSyncStatus })}
      />,
    );

    await waitFor(() => {
      expect(loadSyncStatus).toHaveBeenCalledTimes(2);
    });
  });

  it("calls the application trigger once and disables the button while syncing", async () => {
    let finish: () => void = () => {};
    const runHouseholdSync = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const loadSyncStatus = vi.fn().mockResolvedValue(neverSynced);
    renderControl(api({ loadSyncStatus, runHouseholdSync }));

    await screen.findByText("Never synced");
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));

    expect(runHouseholdSync).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toBe("Syncing…");
    const busy = screen.getByRole("button", { name: "Sync now" });
    expect(busy).toHaveProperty("disabled", true);
    expect(busy.getAttribute("aria-busy")).toBe("true");

    finish();
    await waitFor(() => {
      expect(loadSyncStatus).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("button", { name: "Sync now" })).toHaveProperty(
        "disabled",
        false,
      );
    });
  });

  it("shows Synced after a completed refresh", async () => {
    const loadSyncStatus = vi
      .fn()
      .mockResolvedValueOnce(neverSynced)
      .mockResolvedValueOnce(synced);
    renderControl(api({ loadSyncStatus }));

    await screen.findByText("Never synced");
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));

    expect(await screen.findByText("Synced")).toBeTruthy();
  });

  it("shows the business failure sentence after a stopped refresh", async () => {
    const loadSyncStatus = vi
      .fn()
      .mockResolvedValueOnce(synced)
      .mockResolvedValueOnce(failedBusiness);
    renderControl(api({ loadSyncStatus }));

    await screen.findByText("Synced");
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));

    expect(await screen.findByText("Sync failed")).toBeTruthy();
    expect(
      screen.getByText("Could not apply a change. Check quantities and try again."),
    ).toBeTruthy();
  });

  it("evaluates notifications after Sync now resolves, not on pathname reload or throw", async () => {
    const evaluateHouseholdNotifications = vi.fn().mockResolvedValue(undefined);
    const loadSyncStatus = vi.fn().mockResolvedValue(synced);
    const { rerender } = renderControl(
      api({ loadSyncStatus, evaluateHouseholdNotifications }),
    );

    await screen.findByText("Synced");
    expect(evaluateHouseholdNotifications).not.toHaveBeenCalled();

    vi.mocked(usePathname).mockReturnValue("/shopping");
    rerender(
      <SyncStatusControl
        householdId={HOUSEHOLD}
        api={api({ loadSyncStatus, evaluateHouseholdNotifications })}
      />,
    );
    await waitFor(() => {
      expect(loadSyncStatus).toHaveBeenCalledTimes(2);
    });
    expect(evaluateHouseholdNotifications).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    await waitFor(() => {
      expect(evaluateHouseholdNotifications).toHaveBeenCalledWith(HOUSEHOLD);
    });

    const failing = api({
      loadSyncStatus: vi.fn().mockResolvedValue(synced),
      runHouseholdSync: vi.fn().mockRejectedValue(new Error("offline")),
      evaluateHouseholdNotifications,
    });
    cleanup();
    renderControl(failing);
    await screen.findByText("Synced");
    evaluateHouseholdNotifications.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    await waitFor(() => {
      expect(failing.runHouseholdSync).toHaveBeenCalled();
    });
    expect(evaluateHouseholdNotifications).not.toHaveBeenCalled();
  });

  it("shows the network failure sentence after a transient refresh", async () => {
    const loadSyncStatus = vi
      .fn()
      .mockResolvedValueOnce(synced)
      .mockResolvedValueOnce(failedTransient);
    renderControl(api({ loadSyncStatus }));

    await screen.findByText("Synced");
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));

    expect(await screen.findByText("Sync failed")).toBeTruthy();
    expect(screen.getByText("Could not reach the server. Try again.")).toBeTruthy();
    expect(screen.queryByText(/transient_error/)).toBeNull();
  });
});
