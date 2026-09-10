import { householdRepository } from "@/features/household/repositories/household-repository";
import { locationRepository } from "@/features/locations/repositories/location-repository";
import { productRepository } from "@/features/products/repositories/product-repository";
import { getHouseholdDb } from "@/lib/db";
import type {
  InventoryAllocationPayload,
  InventoryLot,
  InventoryOperation,
  InventoryOperationType,
} from "@/lib/db";
import type { DomainErrorCode } from "@/lib/domain/result";
import {
  applyLotDelta,
  selectLotsForConsumption,
} from "@/lib/domain/inventory/lots";
import { validateMove } from "@/lib/domain/inventory/move";
import { validateInventoryOperation } from "@/lib/domain/inventory/operations";
import { isPositiveInteger, totalQuantity } from "@/lib/domain/inventory/stock";
import { createOperationId } from "@/lib/sync/operation-id";
import { createPendingOperation, enqueue } from "@/lib/sync/outbox";
import { inventoryOperationRepository } from "../repositories/inventory-operation-repository";
import { inventoryRepository } from "../repositories/inventory-repository";

export type InventoryMutationErrorCode =
  | "invalid_quantity"
  | "insufficient_stock"
  | "invalid_household"
  | "invalid_product"
  | "invalid_location"
  | "invalid_lot"
  | "invalid_operation"
  | "invalid_move"
  | "persistence_failure";

export type InventoryMutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: InventoryMutationErrorCode };

export type AddInventoryInput = {
  household_id: string;
  user_id: string;
  product_id: string;
  location_id: string;
  quantity: number;
  expiration_date?: string | null;
  inventory_lot_id?: string | null;
  operation_id?: string;
  client_created_at?: string;
};

export type RemoveInventoryInput = {
  household_id: string;
  user_id: string;
  product_id: string;
  location_id: string;
  quantity: number;
  inventory_lot_id?: string | null;
  operation_id?: string;
  client_created_at?: string;
};

export type InventoryMutationSuccess = {
  operation_id: string;
  lots: InventoryLot[];
};

export type MoveInventoryInput = {
  household_id: string;
  user_id: string;
  product_id: string;
  source_location_id: string;
  destination_location_id: string;
  quantity: number;
  operation_id?: string;
  client_created_at?: string;
};

export type InventoryAddPlan = {
  lots: InventoryLot[];
  inventory_lot_id: string | null;
  delta: number;
  operation_type: InventoryOperationType;
  allocations: InventoryAllocationPayload[];
};

type MutationPlan = InventoryAddPlan;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function mutationOk(
  value: InventoryMutationSuccess,
): InventoryMutationResult<InventoryMutationSuccess> {
  return { ok: true, value };
}

function mutationErr<T = never>(
  code: InventoryMutationErrorCode,
): InventoryMutationResult<T> {
  return { ok: false, code };
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function mapDomainCode(code: DomainErrorCode): InventoryMutationErrorCode {
  if (
    code === "invalid_quantity" ||
    code === "insufficient_stock" ||
    code === "invalid_operation" ||
    code === "invalid_move"
  ) {
    return code;
  }

  return "invalid_operation";
}

function resolveExpiration(
  expirationDate: string | null | undefined,
): InventoryMutationResult<string | null> {
  if (expirationDate === undefined || expirationDate === null) {
    return { ok: true, value: null };
  }

  if (!ISO_DATE.test(expirationDate)) {
    return mutationErr("invalid_lot");
  }

  return { ok: true, value: expirationDate };
}

async function loadContext(input: {
  household_id: string;
  product_id: string;
  location_id: string;
}): Promise<InventoryMutationResult<void>> {
  if (!isNonEmpty(input.household_id)) {
    return mutationErr("invalid_household");
  }

  const household = await householdRepository.getById(input.household_id);
  if (!household) {
    return mutationErr("invalid_household");
  }

  const product = await productRepository.getById(
    input.household_id,
    input.product_id,
  );
  if (!product) {
    return mutationErr("invalid_product");
  }

  const location = await locationRepository.getById(
    input.household_id,
    input.location_id,
  );
  if (!location) {
    return mutationErr("invalid_location");
  }

  return { ok: true, value: undefined };
}

function validateCommon(input: {
  household_id: string;
  user_id: string;
  quantity: number;
}): InventoryMutationErrorCode | null {
  if (!isPositiveInteger(input.quantity)) {
    return "invalid_quantity";
  }

  if (!isNonEmpty(input.user_id)) {
    return "invalid_operation";
  }

  if (!isNonEmpty(input.household_id)) {
    return "invalid_household";
  }

  return null;
}

async function resolveAddLot(
  input: AddInventoryInput,
  expirationDate: string | null,
  candidateLotId: string,
  now: string,
): Promise<InventoryMutationResult<InventoryLot>> {
  if (input.inventory_lot_id) {
    const lot = await inventoryRepository.getLotById(
      input.household_id,
      input.inventory_lot_id,
    );

    if (
      !lot ||
      lot.product_id !== input.product_id ||
      lot.location_id !== input.location_id
    ) {
      return mutationErr("invalid_lot");
    }

    if (expirationDate !== null && lot.expiration_date !== expirationDate) {
      return mutationErr("invalid_lot");
    }

    return { ok: true, value: lot };
  }

  const existing = await inventoryRepository.listLotsForProductAtLocation(
    input.household_id,
    input.product_id,
    input.location_id,
  );
  const compatible = existing.find(
    (lot) => lot.expiration_date === expirationDate,
  );

  if (compatible) {
    return { ok: true, value: compatible };
  }

  return {
    ok: true,
    value: {
      id: candidateLotId,
      household_id: input.household_id,
      product_id: input.product_id,
      location_id: input.location_id,
      quantity: 0,
      expiration_date: expirationDate,
      created_at: now,
      updated_at: now,
    },
  };
}

async function planAdd(
  input: AddInventoryInput,
  operationId: string,
  candidateLotId: string,
  now: string,
): Promise<InventoryMutationResult<MutationPlan>> {
  const context = await loadContext(input);
  if (!context.ok) {
    return context;
  }

  const expiration = resolveExpiration(input.expiration_date);
  if (!expiration.ok) {
    return expiration;
  }

  const lotResult = await resolveAddLot(
    input,
    expiration.value,
    candidateLotId,
    now,
  );
  if (!lotResult.ok) {
    return lotResult;
  }

  const operation = validateInventoryOperation({
    operation_id: operationId,
    household_id: input.household_id,
    product_id: input.product_id,
    location_id: input.location_id,
    delta: input.quantity,
    operation_type: "ADD",
  });
  if (!operation.ok) {
    return mutationErr(mapDomainCode(operation.code));
  }

  const nextQuantity = applyLotDelta(lotResult.value, input.quantity);
  if (!nextQuantity.ok) {
    return mutationErr(mapDomainCode(nextQuantity.code));
  }

  return {
    ok: true,
    value: {
      lots: [{ ...lotResult.value, quantity: nextQuantity.value, updated_at: now }],
      inventory_lot_id: lotResult.value.id,
      delta: input.quantity,
      operation_type: "ADD",
      allocations: [
        {
          inventory_lot_id: lotResult.value.id,
          delta: input.quantity,
          expiration_date: lotResult.value.expiration_date,
        },
      ],
    },
  };
}

async function planRemove(
  input: RemoveInventoryInput,
  operationId: string,
  now: string,
): Promise<InventoryMutationResult<MutationPlan>> {
  const context = await loadContext(input);
  if (!context.ok) {
    return context;
  }

  const operation = validateInventoryOperation({
    operation_id: operationId,
    household_id: input.household_id,
    product_id: input.product_id,
    location_id: input.location_id,
    delta: -input.quantity,
    operation_type: "REMOVE",
  });
  if (!operation.ok) {
    return mutationErr(mapDomainCode(operation.code));
  }

  if (input.inventory_lot_id) {
    const lot = await inventoryRepository.getLotById(
      input.household_id,
      input.inventory_lot_id,
    );

    if (
      !lot ||
      lot.product_id !== input.product_id ||
      lot.location_id !== input.location_id
    ) {
      return mutationErr("invalid_lot");
    }

    const nextQuantity = applyLotDelta(lot, -input.quantity);
    if (!nextQuantity.ok) {
      return mutationErr(mapDomainCode(nextQuantity.code));
    }

    return {
      ok: true,
      value: {
        lots: [{ ...lot, quantity: nextQuantity.value, updated_at: now }],
        inventory_lot_id: lot.id,
        delta: -input.quantity,
        operation_type: "REMOVE",
        allocations: [{ inventory_lot_id: lot.id, delta: -input.quantity }],
      },
    };
  }

  const lots = await inventoryRepository.listLotsForProductAtLocation(
    input.household_id,
    input.product_id,
    input.location_id,
  );
  const allocations = selectLotsForConsumption(lots, input.quantity);
  if (!allocations.ok) {
    return mutationErr(mapDomainCode(allocations.code));
  }

  const lotsById = new Map(lots.map((lot) => [lot.id, lot]));
  const written: InventoryLot[] = [];
  const plannedAllocations: InventoryAllocationPayload[] = [];

  for (const allocation of allocations.value) {
    const lot = lotsById.get(allocation.lot_id);
    if (!lot) {
      return mutationErr("invalid_lot");
    }

    const nextQuantity = applyLotDelta(lot, -allocation.quantity);
    if (!nextQuantity.ok) {
      return mutationErr(mapDomainCode(nextQuantity.code));
    }

    written.push({ ...lot, quantity: nextQuantity.value, updated_at: now });
    plannedAllocations.push({
      inventory_lot_id: lot.id,
      delta: -allocation.quantity,
    });
  }

  return {
    ok: true,
    value: {
      lots: written,
      inventory_lot_id: written.length === 1 ? written[0].id : null,
      delta: -input.quantity,
      operation_type: "REMOVE",
      allocations: plannedAllocations,
    },
  };
}

async function persistLotsAndHistory(
  input: {
    household_id: string;
    user_id: string;
    product_id: string;
    location_id: string;
  },
  operationId: string,
  createdAt: string,
  clientCreatedAt: string,
  plan: MutationPlan,
): Promise<void> {
  for (const lot of plan.lots) {
    await inventoryRepository.putLot(lot);
  }

  const history: InventoryOperation = {
    id: operationId,
    operation_id: operationId,
    household_id: input.household_id,
    user_id: input.user_id,
    product_id: input.product_id,
    location_id: input.location_id,
    inventory_lot_id: plan.inventory_lot_id,
    delta: plan.delta,
    operation_type: plan.operation_type,
    created_at: createdAt,
    client_created_at: clientCreatedAt,
  };

  await inventoryOperationRepository.add(history);
}

async function persistPlan(
  input: {
    household_id: string;
    user_id: string;
    product_id: string;
    location_id: string;
  },
  operationId: string,
  createdAt: string,
  clientCreatedAt: string,
  plan: MutationPlan,
): Promise<void> {
  await persistLotsAndHistory(input, operationId, createdAt, clientCreatedAt, plan);
  await enqueue(
    createPendingOperation({
      household_id: input.household_id,
      operation_id: operationId,
      operation_type: "INVENTORY_DELTA",
      payload: {
        product_id: input.product_id,
        location_id: input.location_id,
        operation_type: plan.operation_type,
        allocations: plan.allocations,
        client_created_at: clientCreatedAt,
      },
      created_at: createdAt,
    }),
  );
}

async function runInTransaction<T>(
  work: () => Promise<InventoryMutationResult<T>>,
): Promise<InventoryMutationResult<T>> {
  const db = getHouseholdDb();

  try {
    return await db.transaction(
      "rw",
      [
        db.households,
        db.products,
        db.locations,
        db.inventory_lots,
        db.inventory_operations,
        db.pending_operations,
      ],
      work,
    );
  } catch {
    return { ok: false, code: "persistence_failure" };
  }
}

export async function planInventoryAdd(
  input: AddInventoryInput,
  operationId: string,
  candidateLotId: string,
  now: string,
): Promise<InventoryMutationResult<InventoryAddPlan>> {
  return planAdd(input, operationId, candidateLotId, now);
}

export async function persistInventoryAddLocal(
  input: AddInventoryInput,
  operationId: string,
  createdAt: string,
  clientCreatedAt: string,
  plan: InventoryAddPlan,
): Promise<void> {
  await persistLotsAndHistory(input, operationId, createdAt, clientCreatedAt, plan);
}

export async function persistInventoryAdd(
  input: AddInventoryInput,
  operationId: string,
  createdAt: string,
  clientCreatedAt: string,
  plan: InventoryAddPlan,
): Promise<void> {
  await persistPlan(input, operationId, createdAt, clientCreatedAt, plan);
}

export async function addInventory(
  input: AddInventoryInput,
): Promise<InventoryMutationResult<InventoryMutationSuccess>> {
  const common = validateCommon(input);
  if (common) {
    return mutationErr(common);
  }

  const operationId = input.operation_id ?? createOperationId();
  const candidateLotId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const clientCreatedAt = input.client_created_at ?? createdAt;

  return runInTransaction(async () => {
    const planned = await planInventoryAdd(
      input,
      operationId,
      candidateLotId,
      createdAt,
    );
    if (!planned.ok) {
      return planned;
    }

    await persistInventoryAdd(
      input,
      operationId,
      createdAt,
      clientCreatedAt,
      planned.value,
    );
    return mutationOk({ operation_id: operationId, lots: planned.value.lots });
  });
}

export async function removeInventory(
  input: RemoveInventoryInput,
): Promise<InventoryMutationResult<InventoryMutationSuccess>> {
  const common = validateCommon(input);
  if (common) {
    return mutationErr(common);
  }

  const operationId = input.operation_id ?? createOperationId();
  const createdAt = new Date().toISOString();
  const clientCreatedAt = input.client_created_at ?? createdAt;

  return runInTransaction(async () => {
    const planned = await planRemove(input, operationId, createdAt);
    if (!planned.ok) {
      return planned;
    }

    await persistPlan(input, operationId, createdAt, clientCreatedAt, planned.value);
    return mutationOk({ operation_id: operationId, lots: planned.value.lots });
  });
}

async function loadMoveContext(
  input: MoveInventoryInput,
): Promise<InventoryMutationResult<void>> {
  if (!isNonEmpty(input.household_id)) {
    return mutationErr("invalid_household");
  }

  const household = await householdRepository.getById(input.household_id);
  if (!household) {
    return mutationErr("invalid_household");
  }

  const product = await productRepository.getById(
    input.household_id,
    input.product_id,
  );
  if (!product) {
    return mutationErr("invalid_product");
  }

  const source = await locationRepository.getById(
    input.household_id,
    input.source_location_id,
  );
  const destination = await locationRepository.getById(
    input.household_id,
    input.destination_location_id,
  );
  if (!source || !destination) {
    return mutationErr("invalid_location");
  }

  return { ok: true, value: undefined };
}

async function planMoveDestination(
  input: MoveInventoryInput,
  sourcePlan: MutationPlan,
  now: string,
): Promise<InventoryMutationResult<MutationPlan>> {
  const sourceLotsById = new Map(sourcePlan.lots.map((lot) => [lot.id, lot]));
  const grouped = new Map<string | null, number>();

  for (const allocation of sourcePlan.allocations) {
    const sourceLot = sourceLotsById.get(allocation.inventory_lot_id);
    if (!sourceLot) {
      return mutationErr("invalid_lot");
    }
    grouped.set(
      sourceLot.expiration_date,
      (grouped.get(sourceLot.expiration_date) ?? 0) - allocation.delta,
    );
  }

  const destInput: AddInventoryInput = {
    household_id: input.household_id,
    user_id: input.user_id,
    product_id: input.product_id,
    location_id: input.destination_location_id,
    quantity: input.quantity,
  };

  const written: InventoryLot[] = [];
  const plannedAllocations: InventoryAllocationPayload[] = [];

  for (const [expirationDate, quantity] of grouped) {
    const lotResult = await resolveAddLot(
      destInput,
      expirationDate,
      crypto.randomUUID(),
      now,
    );
    if (!lotResult.ok) {
      return lotResult;
    }

    const nextQuantity = applyLotDelta(lotResult.value, quantity);
    if (!nextQuantity.ok) {
      return mutationErr(mapDomainCode(nextQuantity.code));
    }

    written.push({
      ...lotResult.value,
      quantity: nextQuantity.value,
      updated_at: now,
    });
    plannedAllocations.push({
      inventory_lot_id: lotResult.value.id,
      location_id: input.destination_location_id,
      delta: quantity,
      expiration_date: lotResult.value.expiration_date,
    });
  }

  return {
    ok: true,
    value: {
      lots: written,
      inventory_lot_id: null,
      delta: input.quantity,
      operation_type: "MOVE",
      allocations: plannedAllocations,
    },
  };
}

export async function moveInventory(
  input: MoveInventoryInput,
): Promise<InventoryMutationResult<InventoryMutationSuccess>> {
  const common = validateCommon(input);
  if (common) {
    return mutationErr(common);
  }

  const operationId = input.operation_id ?? createOperationId();
  const createdAt = new Date().toISOString();
  const clientCreatedAt = input.client_created_at ?? createdAt;

  return runInTransaction(async () => {
    const context = await loadMoveContext(input);
    if (!context.ok) {
      return context;
    }

    const sourceLots = await inventoryRepository.listLotsForProductAtLocation(
      input.household_id,
      input.product_id,
      input.source_location_id,
    );
    const move = validateMove({
      sourceLocationId: input.source_location_id,
      destinationLocationId: input.destination_location_id,
      quantity: input.quantity,
      sourceQuantity: totalQuantity(sourceLots),
    });
    if (!move.ok) {
      return mutationErr(mapDomainCode(move.code));
    }

    const operation = validateInventoryOperation({
      operation_id: operationId,
      household_id: input.household_id,
      product_id: input.product_id,
      location_id: input.source_location_id,
      delta: input.quantity,
      operation_type: "MOVE",
    });
    if (!operation.ok) {
      return mutationErr(mapDomainCode(operation.code));
    }

    const sourcePlan = await planRemove(
      {
        household_id: input.household_id,
        user_id: input.user_id,
        product_id: input.product_id,
        location_id: input.source_location_id,
        quantity: input.quantity,
      },
      operationId,
      createdAt,
    );
    if (!sourcePlan.ok) {
      return sourcePlan;
    }

    const destPlan = await planMoveDestination(input, sourcePlan.value, createdAt);
    if (!destPlan.ok) {
      return destPlan;
    }

    const combined: MutationPlan = {
      lots: [...sourcePlan.value.lots, ...destPlan.value.lots],
      inventory_lot_id: null,
      delta: input.quantity,
      operation_type: "MOVE",
      allocations: [
        ...sourcePlan.value.allocations.map((allocation) => ({
          inventory_lot_id: allocation.inventory_lot_id,
          location_id: input.source_location_id,
          delta: allocation.delta,
        })),
        ...destPlan.value.allocations,
      ],
    };

    await persistPlan(
      {
        household_id: input.household_id,
        user_id: input.user_id,
        product_id: input.product_id,
        location_id: input.source_location_id,
      },
      operationId,
      createdAt,
      clientCreatedAt,
      combined,
    );

    return mutationOk({ operation_id: operationId, lots: combined.lots });
  });
}
