import "fake-indexeddb/auto";

import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { resetHouseholdDbForTests } from "@/lib/db";
import type { InventoryAllocationPayload, InventoryCommandPayload } from "@/lib/db";
import { isInventoryCommandPayload } from "@/lib/db";
import {
  createPendingOperation,
  enqueue,
  getByOperationId,
  listPending,
} from "@/lib/sync/outbox";
import { pendingOperationRepository } from "@/lib/sync/pending-operation-repository";
import { uploadPendingOperations } from "@/lib/sync/uploader";

const LOCAL_API = "http://127.0.0.1:54321";

type Json = Record<string, unknown>;

type SessionTokens = {
  access_token: string;
  refresh_token: string;
};

type HouseholdContext = {
  tokens: SessionTokens;
  householdId: string;
  productId: string;
  locationId: string;
};

function localSupabaseEnv(): { api: string; anon: string } | null {
  try {
    const output = execFileSync("npx", ["supabase", "status", "-o", "env"], {
      encoding: "utf8",
      timeout: 60_000,
    });
    const value = (name: string) =>
      output.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.replace(/^['"]|['"]$/g, "");
    const api = value("API_URL") ?? value("SUPABASE_URL") ?? LOCAL_API;
    const anon = value("ANON_KEY") ?? value("SUPABASE_ANON_KEY");
    if (!anon) {
      return null;
    }
    if (!api.startsWith("http://127.0.0.1:") && !api.startsWith("http://localhost:")) {
      return null;
    }
    return { api, anon };
  } catch {
    return null;
  }
}

async function detectLocalSupabase(): Promise<{ api: string; anon: string } | null> {
  try {
    const health = await fetch(`${LOCAL_API}/auth/v1/health`);
    if (!health.ok && health.status !== 200) {
      return null;
    }
  } catch {
    return null;
  }
  return localSupabaseEnv();
}

const local = await detectLocalSupabase();
const API = local?.api ?? LOCAL_API;
const LOCAL_ANON = local?.anon ?? "";
const supabaseUp = local !== null;

function headers(token: string): HeadersInit {
  return {
    apikey: LOCAL_ANON,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? (JSON.parse(text) as unknown) : null;
}

async function signIn(email: string, password: string): Promise<SessionTokens> {
  const signup = await fetch(`${API}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: LOCAL_ANON,
      Authorization: `Bearer ${LOCAL_ANON}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  expect(signup.ok, await signup.clone().text()).toBe(true);

  const session = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: LOCAL_ANON,
      Authorization: `Bearer ${LOCAL_ANON}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const sessionText = await session.text();
  expect(session.ok, sessionText).toBe(true);
  const body = JSON.parse(sessionText) as SessionTokens;
  expect(body.access_token).toBeTruthy();
  expect(body.refresh_token).toBeTruthy();
  return body;
}

async function restGet<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`${API}/rest/v1/${path}`, { headers: headers(token) });
  expect(response.ok).toBe(true);
  return (await response.json()) as T;
}

async function restPost<T>(token: string, table: string, row: Json): Promise<T> {
  const response = await fetch(`${API}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...headers(token), Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  const text = await response.text();
  expect(response.ok, text).toBe(true);
  return (JSON.parse(text) as T[])[0];
}

async function rpc(
  token: string,
  name: string,
  args: Json,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${API}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(args),
  });
  return { status: response.status, body: await parseJson(response) };
}

async function bootstrapUser(label: string): Promise<HouseholdContext> {
  const email = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  const tokens = await signIn(email, "password-123456");
  const created = await rpc(tokens.access_token, "create_household", {
    p_name: `${label} house`,
  });
  expect(created.status).toBe(200);
  const householdId = created.body as string;
  const categories = await restGet<{ id: string }[]>(
    tokens.access_token,
    "categories?select=id&limit=1",
  );
  const locations = await restGet<{ id: string }[]>(
    tokens.access_token,
    "locations?select=id&name=eq.Kitchen",
  );
  const product = await restPost<{ id: string }>(tokens.access_token, "products", {
    household_id: householdId,
    name: `Sauce ${label} ${Date.now()}`,
    category_id: categories[0].id,
    minimum_stock: 0,
  });
  return {
    tokens,
    householdId,
    productId: product.id,
    locationId: locations[0].id,
  };
}

async function addLot(
  ctx: HouseholdContext,
  quantity: number,
  expiration: string | null = null,
): Promise<{ id: string; quantity: number }> {
  return restPost(ctx.tokens.access_token, "inventory_lots", {
    household_id: ctx.householdId,
    product_id: ctx.productId,
    location_id: ctx.locationId,
    quantity,
    expiration_date: expiration,
  });
}

async function lotQuantity(ctx: HouseholdContext, id: string): Promise<number> {
  const rows = await restGet<{ quantity: number }[]>(
    ctx.tokens.access_token,
    `inventory_lots?id=eq.${id}&select=quantity`,
  );
  return rows[0]?.quantity ?? -1;
}

async function userClient(tokens: SessionTokens): Promise<SupabaseClient> {
  const client = createClient(API, LOCAL_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });
  expect(error).toBeNull();
  return client;
}

function commandPayload(
  ctx: HouseholdContext,
  allocations: InventoryAllocationPayload[],
  operationType: "ADD" | "REMOVE" = "ADD",
): InventoryCommandPayload {
  return {
    product_id: ctx.productId,
    location_id: ctx.locationId,
    operation_type: operationType,
    allocations,
  };
}

beforeEach(async () => {
  await resetHouseholdDbForTests();
});

describe.skipIf(!supabaseUp)("uploadPendingOperations integration", () => {
  it("uploads an ADD, removes the outbox row, and changes server stock once", async () => {
    const user = await bootstrapUser("up-add");
    const lot = await addLot(user, 4);
    const operationId = crypto.randomUUID();
    await enqueue(
      createPendingOperation({
        household_id: user.householdId,
        operation_id: operationId,
        operation_type: "INVENTORY_DELTA",
        payload: commandPayload(user, [
          { inventory_lot_id: lot.id, delta: 2, expiration_date: null },
        ]),
      }),
    );

    const result = await uploadPendingOperations(user.householdId, {
      supabase: await userClient(user.tokens),
    });

    expect(result.stop_reason).toBe("completed");
    expect(result.uploaded_operation_ids).toEqual([operationId]);
    expect(await getByOperationId(user.householdId, operationId)).toBeNull();
    expect(await lotQuantity(user, lot.id)).toBe(6);

    const lines = await restGet<{ inventory_lot_id: string; delta: number }[]>(
      user.tokens.access_token,
      `inventory_operation_lots?operation_id=eq.${operationId}&select=inventory_lot_id,delta`,
    );
    expect(lines).toEqual([{ inventory_lot_id: lot.id, delta: 2 }]);
  });

  it("retries the same operation as already_applied without a second stock change", async () => {
    const user = await bootstrapUser("up-idem");
    const lot = await addLot(user, 1);
    const operationId = crypto.randomUUID();
    const payload = commandPayload(user, [
      { inventory_lot_id: lot.id, delta: 3, expiration_date: null },
    ]);
    await enqueue(
      createPendingOperation({
        household_id: user.householdId,
        operation_id: operationId,
        operation_type: "INVENTORY_DELTA",
        payload,
      }),
    );

    const supabase = await userClient(user.tokens);
    expect(
      (await uploadPendingOperations(user.householdId, { supabase })).stop_reason,
    ).toBe("completed");
    expect(await lotQuantity(user, lot.id)).toBe(4);

    await enqueue(
      createPendingOperation({
        household_id: user.householdId,
        operation_id: operationId,
        operation_type: "INVENTORY_DELTA",
        payload,
      }),
    );

    const retry = await uploadPendingOperations(user.householdId, { supabase });
    expect(retry.stop_reason).toBe("completed");
    expect(retry.uploaded_operation_ids).toEqual([operationId]);
    expect(await getByOperationId(user.householdId, operationId)).toBeNull();
    expect(await lotQuantity(user, lot.id)).toBe(4);
  });

  it("marks a conflicting payload failed and leaves the operation id unchanged", async () => {
    const user = await bootstrapUser("up-conf");
    const lot = await addLot(user, 2);
    const operationId = crypto.randomUUID();

    const first = await rpc(user.tokens.access_token, "apply_inventory_command", {
      p_operation_id: operationId,
      p_product_id: user.productId,
      p_location_id: user.locationId,
      p_operation_type: "ADD",
      p_allocations: [{ inventory_lot_id: lot.id, delta: 1, expiration_date: null }],
    });
    expect(first.body).toEqual({
      ok: true,
      status: "applied",
      operation_id: operationId,
    });

    const conflicting = createPendingOperation({
      household_id: user.householdId,
      operation_id: operationId,
      operation_type: "INVENTORY_DELTA",
      payload: commandPayload(user, [
        { inventory_lot_id: lot.id, delta: 4, expiration_date: null },
      ]),
    });
    await pendingOperationRepository.put(conflicting);

    const result = await uploadPendingOperations(user.householdId, {
      supabase: await userClient(user.tokens),
    });
    const stored = await getByOperationId(user.householdId, operationId);

    expect(result.stop_reason).toBe("conflict");
    expect(stored?.status).toBe("failed");
    expect(stored?.last_error).toBe("conflict");
    expect(stored?.operation_id).toBe(operationId);
    expect(
      stored && isInventoryCommandPayload(stored.payload)
        ? stored.payload.allocations
        : undefined,
    ).toEqual([
      { inventory_lot_id: lot.id, delta: 4, expiration_date: null },
    ]);
    expect(await lotQuantity(user, lot.id)).toBe(3);
  });

  it("marks insufficient stock failed and does not start a retry loop", async () => {
    const user = await bootstrapUser("up-short");
    const lot = await addLot(user, 1);
    const operationId = crypto.randomUUID();
    await enqueue(
      createPendingOperation({
        household_id: user.householdId,
        operation_id: operationId,
        operation_type: "INVENTORY_DELTA",
        payload: commandPayload(
          user,
          [{ inventory_lot_id: lot.id, delta: -4 }],
          "REMOVE",
        ),
      }),
    );

    const supabase = await userClient(user.tokens);
    const result = await uploadPendingOperations(user.householdId, { supabase });
    const second = await uploadPendingOperations(user.householdId, { supabase });

    expect(result.stop_reason).toBe("business_rejection");
    expect(result.error?.code).toBe("insufficient_stock");
    expect(second.stop_reason).toBe("empty");
    expect(await getByOperationId(user.householdId, operationId)).toMatchObject({
      status: "failed",
      operation_id: operationId,
    });
    expect(await lotQuantity(user, lot.id)).toBe(1);
  });

  it("removes a successful first operation and keeps a later business failure", async () => {
    const user = await bootstrapUser("up-fifo");
    const lot = await addLot(user, 1);
    const addId = crypto.randomUUID();
    const removeId = crypto.randomUUID();

    await enqueue(
      createPendingOperation({
        household_id: user.householdId,
        operation_id: addId,
        operation_type: "INVENTORY_DELTA",
        payload: commandPayload(user, [
          { inventory_lot_id: lot.id, delta: 2, expiration_date: null },
        ]),
        created_at: "2026-09-09T10:00:00.000Z",
      }),
    );
    await enqueue(
      createPendingOperation({
        household_id: user.householdId,
        operation_id: removeId,
        operation_type: "INVENTORY_DELTA",
        payload: commandPayload(
          user,
          [{ inventory_lot_id: lot.id, delta: -10 }],
          "REMOVE",
        ),
        created_at: "2026-09-09T11:00:00.000Z",
      }),
    );

    const result = await uploadPendingOperations(user.householdId, {
      supabase: await userClient(user.tokens),
    });

    expect(result.uploaded_operation_ids).toEqual([addId]);
    expect(result.stopped_operation_id).toBe(removeId);
    expect(result.stop_reason).toBe("business_rejection");
    expect(await getByOperationId(user.householdId, addId)).toBeNull();
    expect(await getByOperationId(user.householdId, removeId)).toMatchObject({
      status: "failed",
      last_error: "insufficient_stock",
    });
    expect(await lotQuantity(user, lot.id)).toBe(3);
  });

  it("uploads a multi-lot REMOVE as stored allocations", async () => {
    const user = await bootstrapUser("up-multi");
    const soon = await addLot(user, 2, "2027-01-10");
    const later = await addLot(user, 3, "2027-06-20");
    const operationId = crypto.randomUUID();

    await enqueue(
      createPendingOperation({
        household_id: user.householdId,
        operation_id: operationId,
        operation_type: "INVENTORY_DELTA",
        payload: commandPayload(
          user,
          [
            { inventory_lot_id: soon.id, delta: -2 },
            { inventory_lot_id: later.id, delta: -1 },
          ],
          "REMOVE",
        ),
      }),
    );

    const result = await uploadPendingOperations(user.householdId, {
      supabase: await userClient(user.tokens),
    });

    expect(result.stop_reason).toBe("completed");
    expect(await lotQuantity(user, soon.id)).toBe(0);
    expect(await lotQuantity(user, later.id)).toBe(2);

    const parent = await restGet<{ inventory_lot_id: string | null; delta: number }[]>(
      user.tokens.access_token,
      `inventory_operations?operation_id=eq.${operationId}&select=inventory_lot_id,delta`,
    );
    expect(parent).toEqual([{ inventory_lot_id: null, delta: -3 }]);
    const lines = await restGet<{ inventory_lot_id: string; delta: number }[]>(
      user.tokens.access_token,
      `inventory_operation_lots?operation_id=eq.${operationId}&select=inventory_lot_id,delta`,
    );
    expect(lines).toHaveLength(2);
  });

  it("does not upload household B operations for household A", async () => {
    const userA = await bootstrapUser("up-iso-a");
    const userB = await bootstrapUser("up-iso-b");
    const lotB = await addLot(userB, 5);
    const operationB = crypto.randomUUID();

    await enqueue(
      createPendingOperation({
        household_id: userB.householdId,
        operation_id: operationB,
        operation_type: "INVENTORY_DELTA",
        payload: commandPayload(userB, [
          { inventory_lot_id: lotB.id, delta: 1, expiration_date: null },
        ]),
      }),
    );

    const result = await uploadPendingOperations(userA.householdId, {
      supabase: await userClient(userA.tokens),
    });

    expect(result.stop_reason).toBe("empty");
    expect(await listPending(userB.householdId)).toHaveLength(1);
    expect(await lotQuantity(userB, lotB.id)).toBe(5);
  });

  it("rejects anonymous execute of apply_inventory_command", async () => {
    const user = await bootstrapUser("up-anon");
    const lot = await addLot(user, 2);
    const response = await fetch(`${API}/rest/v1/rpc/apply_inventory_command`, {
      method: "POST",
      headers: {
        apikey: LOCAL_ANON,
        Authorization: `Bearer ${LOCAL_ANON}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_operation_id: crypto.randomUUID(),
        p_product_id: user.productId,
        p_location_id: user.locationId,
        p_operation_type: "ADD",
        p_allocations: [{ inventory_lot_id: lot.id, delta: 1 }],
      }),
    });
    expect([401, 403]).toContain(response.status);
    expect(await lotQuantity(user, lot.id)).toBe(2);
  });
});
