import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const FUNCTION_SIG =
  "public.apply_inventory_delta(uuid,uuid,uuid,uuid,integer,text,timestamp with time zone)";

type Json = Record<string, unknown>;

type HouseholdContext = {
  token: string;
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

    const api = value("API_URL") ?? value("SUPABASE_URL");
    const anon = value("ANON_KEY") ?? value("SUPABASE_ANON_KEY");
    if (!api || !anon) {
      return null;
    }
    return { api, anon };
  } catch {
    return null;
  }
}

async function detectLocalSupabase(): Promise<{ api: string; anon: string } | null> {
  try {
    const health = await fetch("http://127.0.0.1:54321/auth/v1/health");
    if (!health.ok && health.status !== 200) {
      return null;
    }
  } catch {
    return null;
  }

  return localSupabaseEnv();
}

const local = await detectLocalSupabase();
const API = local?.api ?? "http://127.0.0.1:54321";
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
  if (!text) {
    return null;
  }
  return JSON.parse(text) as unknown;
}

async function signUp(email: string, password: string): Promise<string> {
  const response = await fetch(`${API}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: LOCAL_ANON,
      Authorization: `Bearer ${LOCAL_ANON}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const signupText = await response.text();
  expect(response.ok, signupText).toBe(true);
  const body = JSON.parse(signupText) as { access_token?: string };
  if (body.access_token) {
    return body.access_token;
  }

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
  const signedIn = JSON.parse(sessionText) as { access_token: string };
  return signedIn.access_token;
}

async function restGet<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`${API}/rest/v1/${path}`, {
    headers: headers(token),
  });
  expect(response.ok).toBe(true);
  return (await response.json()) as T;
}

async function restPost<T>(token: string, table: string, row: Json): Promise<T> {
  const response = await fetch(`${API}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      ...headers(token),
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  expect(response.ok).toBe(true);
  const body = (await response.json()) as T[];
  return body[0];
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

async function applyDelta(
  token: string,
  args: {
    operation_id: string;
    product_id: string;
    location_id: string;
    inventory_lot_id: string | null;
    delta: number;
    operation_type: string;
  },
): Promise<{ status: number; body: unknown }> {
  return rpc(token, "apply_inventory_delta", {
    p_operation_id: args.operation_id,
    p_product_id: args.product_id,
    p_location_id: args.location_id,
    p_inventory_lot_id: args.inventory_lot_id,
    p_delta: args.delta,
    p_operation_type: args.operation_type,
  });
}

async function bootstrapUser(label: string): Promise<HouseholdContext> {
  const email = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  const password = "password-123456";
  const token = await signUp(email, password);

  const created = await rpc(token, "create_household", { p_name: `${label} house` });
  expect(created.status).toBe(200);
  const householdId = created.body as string;

  const categories = await restGet<{ id: string }[]>(
    token,
    "categories?select=id&limit=1",
  );
  const locations = await restGet<{ id: string }[]>(
    token,
    "locations?select=id&name=eq.Kitchen",
  );
  const product = await restPost<{ id: string }>(token, "products", {
    household_id: householdId,
    name: `Sauce ${label} ${Date.now()}`,
    category_id: categories[0].id,
    minimum_stock: 0,
  });

  return {
    token,
    householdId,
    productId: product.id,
    locationId: locations[0].id,
  };
}

async function addLot(
  ctx: HouseholdContext,
  quantity: number,
): Promise<{ id: string; quantity: number }> {
  return restPost<{ id: string; quantity: number }>(ctx.token, "inventory_lots", {
    household_id: ctx.householdId,
    product_id: ctx.productId,
    location_id: ctx.locationId,
    quantity,
  });
}

function sql(query: string): string {
  return execFileSync("psql", [DB, "-At", "-c", query], {
    encoding: "utf8",
  }).trim();
}

function sqlAllowError(query: string): string {
  try {
    return execFileSync("psql", [DB, "-At", "-v", "ON_ERROR_STOP=1", "-c", query], {
      encoding: "utf8",
    }).trim();
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string };
    return `${failed.stdout ?? ""}\n${failed.stderr ?? ""}`;
  }
}

describe.skipIf(!supabaseUp)("apply_inventory_delta", () => {
  it("applies ADD and REMOVE exactly once and records history", async () => {
    const user = await bootstrapUser("basic");
    const lot = await addLot(user, 4);
    const addId = crypto.randomUUID();

    const added = await applyDelta(user.token, {
      operation_id: addId,
      product_id: user.productId,
      location_id: user.locationId,
      inventory_lot_id: lot.id,
      delta: 2,
      operation_type: "ADD",
    });
    expect(added.body).toEqual({
      ok: true,
      status: "applied",
      operation_id: addId,
    });

    let stored = await restGet<{ quantity: number }[]>(
      user.token,
      `inventory_lots?id=eq.${lot.id}&select=quantity`,
    );
    expect(stored[0]?.quantity).toBe(6);

    const removeId = crypto.randomUUID();
    const removed = await applyDelta(user.token, {
      operation_id: removeId,
      product_id: user.productId,
      location_id: user.locationId,
      inventory_lot_id: lot.id,
      delta: -1,
      operation_type: "REMOVE",
    });
    expect(removed.body).toEqual({
      ok: true,
      status: "applied",
      operation_id: removeId,
    });

    stored = await restGet<{ quantity: number }[]>(
      user.token,
      `inventory_lots?id=eq.${lot.id}&select=quantity`,
    );
    expect(stored[0]?.quantity).toBe(5);

    const history = await restGet<{ operation_id: string; delta: number }[]>(
      user.token,
      "inventory_operations?select=operation_id,delta&order=created_at.asc",
    );
    expect(history).toEqual([
      { operation_id: addId, delta: 2 },
      { operation_id: removeId, delta: -1 },
    ]);
  });

  it("retries the same operation_id without changing inventory again", async () => {
    const user = await bootstrapUser("idem");
    const lot = await addLot(user, 3);
    const operationId = crypto.randomUUID();
    const payload = {
      operation_id: operationId,
      product_id: user.productId,
      location_id: user.locationId,
      inventory_lot_id: lot.id,
      delta: 2,
      operation_type: "ADD",
    };

    const first = await applyDelta(user.token, payload);
    const second = await applyDelta(user.token, payload);

    expect(first.body).toEqual({
      ok: true,
      status: "applied",
      operation_id: operationId,
    });
    expect(second.body).toEqual({
      ok: true,
      status: "already_applied",
      operation_id: operationId,
    });

    const stored = await restGet<{ quantity: number }[]>(
      user.token,
      `inventory_lots?id=eq.${lot.id}&select=quantity`,
    );
    expect(stored[0]?.quantity).toBe(5);

    const history = await restGet<{ operation_id: string }[]>(
      user.token,
      `inventory_operations?operation_id=eq.${operationId}&select=operation_id`,
    );
    expect(history).toHaveLength(1);
  });

  it("rejects a reused operation_id with a different payload", async () => {
    const user = await bootstrapUser("conflict");
    const lot = await addLot(user, 4);
    const operationId = crypto.randomUUID();

    await applyDelta(user.token, {
      operation_id: operationId,
      product_id: user.productId,
      location_id: user.locationId,
      inventory_lot_id: lot.id,
      delta: 1,
      operation_type: "ADD",
    });

    const conflicted = await applyDelta(user.token, {
      operation_id: operationId,
      product_id: user.productId,
      location_id: user.locationId,
      inventory_lot_id: lot.id,
      delta: 3,
      operation_type: "ADD",
    });
    expect(conflicted.body).toEqual({ ok: false, code: "conflict" });

    const stored = await restGet<{ quantity: number }[]>(
      user.token,
      `inventory_lots?id=eq.${lot.id}&select=quantity`,
    );
    expect(stored[0]?.quantity).toBe(5);
  });

  it("blocks another household's product, location, and lot", async () => {
    const userA = await bootstrapUser("auth-a");
    const userB = await bootstrapUser("auth-b");
    const lotB = await addLot(userB, 8);

    const asAOnBProduct = await applyDelta(userA.token, {
      operation_id: crypto.randomUUID(),
      product_id: userB.productId,
      location_id: userB.locationId,
      inventory_lot_id: lotB.id,
      delta: -1,
      operation_type: "REMOVE",
    });
    expect(asAOnBProduct.body).toEqual({ ok: false, code: "unauthorized" });

    const asAOnBLocation = await applyDelta(userA.token, {
      operation_id: crypto.randomUUID(),
      product_id: userA.productId,
      location_id: userB.locationId,
      inventory_lot_id: lotB.id,
      delta: 1,
      operation_type: "ADD",
    });
    expect(asAOnBLocation.body).toEqual({ ok: false, code: "invalid_location" });

    const lotA = await addLot(userA, 2);
    const asAOnBLot = await applyDelta(userA.token, {
      operation_id: crypto.randomUUID(),
      product_id: userA.productId,
      location_id: userA.locationId,
      inventory_lot_id: lotB.id,
      delta: -1,
      operation_type: "REMOVE",
    });
    expect(asAOnBLot.body).toEqual({ ok: false, code: "invalid_lot" });

    const storedB = await restGet<{ quantity: number }[]>(
      userB.token,
      `inventory_lots?id=eq.${lotB.id}&select=quantity`,
    );
    expect(storedB[0]?.quantity).toBe(8);
    expect(lotA.quantity).toBe(2);
  });

  it("rejects anonymous execution", async () => {
    const response = await fetch(`${API}/rest/v1/rpc/apply_inventory_delta`, {
      method: "POST",
      headers: {
        apikey: LOCAL_ANON,
        Authorization: `Bearer ${LOCAL_ANON}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_operation_id: crypto.randomUUID(),
        p_product_id: crypto.randomUUID(),
        p_location_id: crypto.randomUUID(),
        p_inventory_lot_id: crypto.randomUUID(),
        p_delta: 1,
        p_operation_type: "ADD",
      }),
    });
    expect([401, 403]).toContain(response.status);
  });

  it("rejects invalid quantities, types, and missing references", async () => {
    const user = await bootstrapUser("valid");
    const lot = await addLot(user, 2);
    const missing = crypto.randomUUID();

    expect(
      (
        await applyDelta(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: user.productId,
          location_id: user.locationId,
          inventory_lot_id: lot.id,
          delta: 0,
          operation_type: "ADD",
        })
      ).body,
    ).toEqual({ ok: false, code: "invalid_quantity" });

    expect(
      (
        await applyDelta(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: user.productId,
          location_id: user.locationId,
          inventory_lot_id: lot.id,
          delta: 1,
          operation_type: "ADJUST",
        })
      ).body,
    ).toEqual({ ok: false, code: "invalid_operation" });

    expect(
      (
        await applyDelta(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: user.productId,
          location_id: user.locationId,
          inventory_lot_id: lot.id,
          delta: -1,
          operation_type: "ADD",
        })
      ).body,
    ).toEqual({ ok: false, code: "invalid_operation" });

    expect(
      (
        await applyDelta(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: user.productId,
          location_id: user.locationId,
          inventory_lot_id: lot.id,
          delta: 1,
          operation_type: "REMOVE",
        })
      ).body,
    ).toEqual({ ok: false, code: "invalid_operation" });

    expect(
      (
        await applyDelta(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: missing,
          location_id: user.locationId,
          inventory_lot_id: lot.id,
          delta: 1,
          operation_type: "ADD",
        })
      ).body,
    ).toEqual({ ok: false, code: "invalid_product" });

    expect(
      (
        await applyDelta(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: user.productId,
          location_id: missing,
          inventory_lot_id: lot.id,
          delta: 1,
          operation_type: "ADD",
        })
      ).body,
    ).toEqual({ ok: false, code: "invalid_location" });

    expect(
      (
        await applyDelta(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: user.productId,
          location_id: user.locationId,
          inventory_lot_id: missing,
          delta: 1,
          operation_type: "ADD",
        })
      ).body,
    ).toEqual({ ok: false, code: "invalid_lot" });

    expect(
      (
        await applyDelta(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: user.productId,
          location_id: user.locationId,
          inventory_lot_id: null,
          delta: -1,
          operation_type: "REMOVE",
        })
      ).body,
    ).toEqual({ ok: false, code: "invalid_lot" });
  });

  it("rejects a removal that would make the lot negative", async () => {
    const user = await bootstrapUser("neg");
    const lot = await addLot(user, 1);

    const result = await applyDelta(user.token, {
      operation_id: crypto.randomUUID(),
      product_id: user.productId,
      location_id: user.locationId,
      inventory_lot_id: lot.id,
      delta: -2,
      operation_type: "REMOVE",
    });
    expect(result.body).toEqual({ ok: false, code: "insufficient_stock" });

    const stored = await restGet<{ quantity: number }[]>(
      user.token,
      `inventory_lots?id=eq.${lot.id}&select=quantity`,
    );
    expect(stored[0]?.quantity).toBe(1);
    const history = await restGet<unknown[]>(
      user.token,
      "inventory_operations?select=id",
    );
    expect(history).toHaveLength(0);
  });

  it("serializes concurrent removals against limited stock", async () => {
    const user = await bootstrapUser("conc");
    const lot = await addLot(user, 1);
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();

    const results = await Promise.all([
      applyDelta(user.token, {
        operation_id: firstId,
        product_id: user.productId,
        location_id: user.locationId,
        inventory_lot_id: lot.id,
        delta: -1,
        operation_type: "REMOVE",
      }),
      applyDelta(user.token, {
        operation_id: secondId,
        product_id: user.productId,
        location_id: user.locationId,
        inventory_lot_id: lot.id,
        delta: -1,
        operation_type: "REMOVE",
      }),
    ]);

    const bodies = results.map((row) => row.body);
    expect(bodies).toEqual(
      expect.arrayContaining([
        { ok: true, status: "applied", operation_id: expect.any(String) },
        { ok: false, code: "insufficient_stock" },
      ]),
    );
    expect(
      bodies.filter((body) => (body as { status?: string }).status === "applied"),
    ).toHaveLength(1);

    const stored = await restGet<{ quantity: number }[]>(
      user.token,
      `inventory_lots?id=eq.${lot.id}&select=quantity`,
    );
    expect(stored[0]?.quantity).toBe(0);

    const history = await restGet<unknown[]>(
      user.token,
      "inventory_operations?select=id",
    );
    expect(history).toHaveLength(1);
  });

  it("keeps composite FKs and RLS isolation", async () => {
    const userA = await bootstrapUser("fk-a");
    const userB = await bootstrapUser("fk-b");
    await addLot(userB, 3);

    const fk = sqlAllowError(`
      insert into public.inventory_lots (household_id, product_id, location_id, quantity)
      values ('${userA.householdId}', '${userB.productId}', '${userA.locationId}', 1);
    `);
    expect(fk.toLowerCase()).toMatch(/foreign key|violates/);

    const hidden = await restGet<unknown[]>(
      userA.token,
      `inventory_lots?select=id&household_id=eq.${userB.householdId}`,
    );
    expect(hidden).toEqual([]);

    expect(sql(`select has_function_privilege('anon', '${FUNCTION_SIG}', 'execute');`)).toBe(
      "f",
    );
    expect(
      sql(`select has_function_privilege('authenticated', '${FUNCTION_SIG}', 'execute');`),
    ).toBe("t");
  });
});
