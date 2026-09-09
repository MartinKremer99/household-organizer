import { getHouseholdDb } from "@/lib/db";
import type { PendingOperation, PendingOperationStatus } from "@/lib/db";

type StatusExtras = {
  last_error?: string | null;
  last_attempt_at?: string | null;
};

export const pendingOperationRepository = {
  async add(record: PendingOperation): Promise<void> {
    await getHouseholdDb().pending_operations.add(record);
  },

  async put(record: PendingOperation): Promise<void> {
    await getHouseholdDb().pending_operations.put(record);
  },

  async listPending(householdId: string): Promise<PendingOperation[]> {
    const rows = await getHouseholdDb()
      .pending_operations.where("household_id")
      .equals(householdId)
      .toArray();

    return rows
      .filter((row) => row.status === "pending")
      .sort((a, b) => {
        const byCreated = a.created_at.localeCompare(b.created_at);
        if (byCreated !== 0) {
          return byCreated;
        }
        return a.operation_id.localeCompare(b.operation_id);
      });
  },

  async getByOperationId(
    householdId: string,
    operationId: string,
  ): Promise<PendingOperation | null> {
    const row = await getHouseholdDb()
      .pending_operations.where("operation_id")
      .equals(operationId)
      .first();

    if (!row || row.household_id !== householdId) {
      return null;
    }

    return row;
  },

  async updateStatus(
    householdId: string,
    operationId: string,
    status: PendingOperationStatus,
    extras?: StatusExtras,
  ): Promise<void> {
    const row = await pendingOperationRepository.getByOperationId(
      householdId,
      operationId,
    );

    if (!row) {
      return;
    }

    await getHouseholdDb().pending_operations.put({
      ...row,
      status,
      last_error: extras?.last_error === undefined ? row.last_error : extras.last_error,
      last_attempt_at:
        extras?.last_attempt_at === undefined
          ? row.last_attempt_at
          : extras.last_attempt_at,
    });
  },

  async remove(householdId: string, operationId: string): Promise<void> {
    const row = await pendingOperationRepository.getByOperationId(
      householdId,
      operationId,
    );

    if (!row) {
      return;
    }

    await getHouseholdDb().pending_operations.delete(row.id);
  },
};
