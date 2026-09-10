import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const COMMAND_SIG =
  "public.apply_inventory_command(uuid,uuid,uuid,text,jsonb,timestamp with time zone)";

type Json = Record<string, unknown>;

type HouseholdContext = {
  token: string;
  householdId: string;
  productId: string;
  locationId: string;
};

type Allocation = {
  inventory_lot_id: string;
  delta: number;
  expiration_date?: string | null;
  location_id?: string;
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
  return text ? (JSON.parse(text) as unknown) : null;
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
  return (JSON.parse(sessionText) as { access_token: string }).access_token;
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

async function applyCommand(
  token: string,
  args: {
    operation_id: string;
    product_id: string;
    location_id: string;
    operation_type: string;
    allocations: Allocation[];
  },
): Promise<{ status: number; body: unknown }> {
  return rpc(token, "apply_inventory_command", {
    p_operation_id: args.operation_id,
    p_product_id: args.product_id,
    p_location_id: args.location_id,
    p_operation_type: args.operation_type,
    p_allocations: args.allocations,
  });
}

async function bootstrapUser(label: string): Promise<HouseholdContext> {
  const email = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  const token = await signUp(email, "password-123456");
  const created = await rpc(token, "create_household", { p_name: `${label} house` });
  expect(created.status).toBe(200);
  const householdId = created.body as string;
  const categories = await restGet<{ id: string }[]>(token, "categories?select=id&limit=1");
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
  expiration: string | null = null,
  locationId: string = ctx.locationId,
): Promise<{ id: string; quantity: number; location_id: string }> {
  return restPost(ctx.token, "inventory_lots", {
    household_id: ctx.householdId,
    product_id: ctx.productId,
    location_id: locationId,
    quantity,
    expiration_date: expiration,
  });
}

async function createLocation(
  ctx: HouseholdContext,
  name: string,
): Promise<{ id: string }> {
  return restPost(ctx.token, "locations", {
    household_id: ctx.householdId,
    name,
    sort_order: 20,
  });
}

async function lotQuantity(ctx: HouseholdContext, id: string): Promise<number> {
  const rows = await restGet<{ quantity: number }[]>(
    ctx.token,
    `inventory_lots?id=eq.${id}&select=quantity`,
  );
  return rows[0]?.quantity ?? -1;
}

function sql(query: string): string {
  return execFileSync("psql", [DB, "-At", "-c", query], { encoding: "utf8" }).trim();
}

describe.skipIf(!supabaseUp)("apply_inventory_command", () => {
  it("adds and removes a single existing lot", async () => {
    const user = await bootstrapUser("cmd-single");
    const lot = await addLot(user, 4);
    const addId = crypto.randomUUID();

    expect(
      (
        await applyCommand(user.token, {
          operation_id: addId,
          product_id: user.productId,
          location_id: user.locationId,
          operation_type: "ADD",
          allocations: [{ inventory_lot_id: lot.id, delta: 2 }],
        })
      ).body,
    ).toEqual({ ok: true, status: "applied", operation_id: addId });
    expect(await lotQuantity(user, lot.id)).toBe(6);

    const removeId = crypto.randomUUID();
    expect(
      (
        await applyCommand(user.token, {
          operation_id: removeId,
          product_id: user.productId,
          location_id: user.locationId,
          operation_type: "REMOVE",
          allocations: [{ inventory_lot_id: lot.id, delta: -1 }],
        })
      ).body,
    ).toEqual({ ok: true, status: "applied", operation_id: removeId });
    expect(await lotQuantity(user, lot.id)).toBe(5);
  });

  it("rejects a lot that does not belong to the product or location", async () => {
    const user = await bootstrapUser("cmd-rel");
    const other = await bootstrapUser("cmd-rel-b");
    const otherLot = await addLot(other, 3);

    expect(
      (
        await applyCommand(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: user.productId,
          location_id: user.locationId,
          operation_type: "REMOVE",
          allocations: [{ inventory_lot_id: otherLot.id, delta: -1 }],
        })
      ).body,
    ).toEqual({ ok: false, code: "invalid_lot" });
    expect(await lotQuantity(other, otherLot.id)).toBe(3);
  });

  it("rejects insufficient stock on a single lot", async () => {
    const user = await bootstrapUser("cmd-short");
    const lot = await addLot(user, 1);
    expect(
      (
        await applyCommand(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: user.productId,
          location_id: user.locationId,
          operation_type: "REMOVE",
          allocations: [{ inventory_lot_id: lot.id, delta: -2 }],
        })
      ).body,
    ).toEqual({ ok: false, code: "insufficient_stock" });
    expect(await lotQuantity(user, lot.id)).toBe(1);
  });

  it("retries an identical command without changing inventory", async () => {
    const user = await bootstrapUser("cmd-idem");
    const lot = await addLot(user, 2);
    const operationId = crypto.randomUUID();
    const args = {
      operation_id: operationId,
      product_id: user.productId,
      location_id: user.locationId,
      operation_type: "ADD",
      allocations: [{ inventory_lot_id: lot.id, delta: 3 }],
    };
    expect((await applyCommand(user.token, args)).body).toEqual({
      ok: true,
      status: "applied",
      operation_id: operationId,
    });
    expect((await applyCommand(user.token, args)).body).toEqual({
      ok: true,
      status: "already_applied",
      operation_id: operationId,
    });
    expect(await lotQuantity(user, lot.id)).toBe(5);
  });

  it("rejects a reused operation_id with a different payload", async () => {
    const user = await bootstrapUser("cmd-conf");
    const lot = await addLot(user, 2);
    const operationId = crypto.randomUUID();
    await applyCommand(user.token, {
      operation_id: operationId,
      product_id: user.productId,
      location_id: user.locationId,
      operation_type: "ADD",
      allocations: [{ inventory_lot_id: lot.id, delta: 1 }],
    });
    expect(
      (
        await applyCommand(user.token, {
          operation_id: operationId,
          product_id: user.productId,
          location_id: user.locationId,
          operation_type: "ADD",
          allocations: [{ inventory_lot_id: lot.id, delta: 4 }],
        })
      ).body,
    ).toEqual({ ok: false, code: "conflict" });
    expect(await lotQuantity(user, lot.id)).toBe(3);
  });

  it("removes across two lots and records one parent plus two lines", async () => {
    const user = await bootstrapUser("cmd-two");
    const a = await addLot(user, 2, "2027-01-10");
    const b = await addLot(user, 3, "2027-06-20");
    const operationId = crypto.randomUUID();

    expect(
      (
        await applyCommand(user.token, {
          operation_id: operationId,
          product_id: user.productId,
          location_id: user.locationId,
          operation_type: "REMOVE",
          allocations: [
            { inventory_lot_id: a.id, delta: -2 },
            { inventory_lot_id: b.id, delta: -1 },
          ],
        })
      ).body,
    ).toEqual({ ok: true, status: "applied", operation_id: operationId });

    expect(await lotQuantity(user, a.id)).toBe(0);
    expect(await lotQuantity(user, b.id)).toBe(2);

    const parent = await restGet<{ inventory_lot_id: string | null; delta: number }[]>(
      user.token,
      `inventory_operations?operation_id=eq.${operationId}&select=inventory_lot_id,delta`,
    );
    expect(parent).toEqual([{ inventory_lot_id: null, delta: -3 }]);
    const lines = await restGet<{ inventory_lot_id: string; delta: number }[]>(
      user.token,
      `inventory_operation_lots?operation_id=eq.${operationId}&select=inventory_lot_id,delta`,
    );
    expect(lines).toHaveLength(2);
  });

  it("removes across three lots", async () => {
    const user = await bootstrapUser("cmd-three");
    const a = await addLot(user, 2, "2027-01-10");
    const b = await addLot(user, 3, "2027-06-20");
    const c = await addLot(user, 4, null);
    const operationId = crypto.randomUUID();

    expect(
      (
        await applyCommand(user.token, {
          operation_id: operationId,
          product_id: user.productId,
          location_id: user.locationId,
          operation_type: "REMOVE",
          allocations: [
            { inventory_lot_id: a.id, delta: -1 },
            { inventory_lot_id: b.id, delta: -2 },
            { inventory_lot_id: c.id, delta: -3 },
          ],
        })
      ).body,
    ).toEqual({ ok: true, status: "applied", operation_id: operationId });

    expect(await lotQuantity(user, a.id)).toBe(1);
    expect(await lotQuantity(user, b.id)).toBe(1);
    expect(await lotQuantity(user, c.id)).toBe(1);

    const lines = await restGet<unknown[]>(
      user.token,
      `inventory_operation_lots?operation_id=eq.${operationId}&select=inventory_lot_id`,
    );
    expect(lines).toHaveLength(3);
  });

  it("rolls back when one allocation lot is unknown", async () => {
    const user = await bootstrapUser("cmd-bad-lot");
    const a = await addLot(user, 4);
    const missing = crypto.randomUUID();

    expect(
      (
        await applyCommand(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: user.productId,
          location_id: user.locationId,
          operation_type: "REMOVE",
          allocations: [
            { inventory_lot_id: a.id, delta: -1 },
            { inventory_lot_id: missing, delta: -1 },
          ],
        })
      ).body,
    ).toEqual({ ok: false, code: "invalid_lot" });
    expect(await lotQuantity(user, a.id)).toBe(4);
    const history = await restGet<unknown[]>(user.token, "inventory_operations?select=id");
    expect(history).toHaveLength(0);
  });

  it("rolls back when one allocation has insufficient stock", async () => {
    const user = await bootstrapUser("cmd-partial");
    const a = await addLot(user, 4);
    const b = await addLot(user, 1);

    expect(
      (
        await applyCommand(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: user.productId,
          location_id: user.locationId,
          operation_type: "REMOVE",
          allocations: [
            { inventory_lot_id: a.id, delta: -1 },
            { inventory_lot_id: b.id, delta: -3 },
          ],
        })
      ).body,
    ).toEqual({ ok: false, code: "insufficient_stock" });
    expect(await lotQuantity(user, a.id)).toBe(4);
    expect(await lotQuantity(user, b.id)).toBe(1);
  });

  it("does not double-apply a retried multi-lot command", async () => {
    const user = await bootstrapUser("cmd-retry");
    const a = await addLot(user, 5);
    const b = await addLot(user, 5);
    const operationId = crypto.randomUUID();
    const args = {
      operation_id: operationId,
      product_id: user.productId,
      location_id: user.locationId,
      operation_type: "REMOVE",
      allocations: [
        { inventory_lot_id: b.id, delta: -2 },
        { inventory_lot_id: a.id, delta: -1 },
      ],
    };

    expect((await applyCommand(user.token, args)).body).toMatchObject({
      ok: true,
      status: "applied",
    });
    expect((await applyCommand(user.token, args)).body).toMatchObject({
      ok: true,
      status: "already_applied",
    });
    expect(await lotQuantity(user, a.id)).toBe(4);
    expect(await lotQuantity(user, b.id)).toBe(3);
  });

  it("conflicts when the same operation_id has different allocations", async () => {
    const user = await bootstrapUser("cmd-alloc-conf");
    const a = await addLot(user, 5);
    const b = await addLot(user, 5);
    const operationId = crypto.randomUUID();

    await applyCommand(user.token, {
      operation_id: operationId,
      product_id: user.productId,
      location_id: user.locationId,
      operation_type: "REMOVE",
      allocations: [
        { inventory_lot_id: a.id, delta: -1 },
        { inventory_lot_id: b.id, delta: -1 },
      ],
    });

    expect(
      (
        await applyCommand(user.token, {
          operation_id: operationId,
          product_id: user.productId,
          location_id: user.locationId,
          operation_type: "REMOVE",
          allocations: [
            { inventory_lot_id: a.id, delta: -2 },
            { inventory_lot_id: b.id, delta: -1 },
          ],
        })
      ).body,
    ).toEqual({ ok: false, code: "conflict" });
    expect(await lotQuantity(user, a.id)).toBe(4);
    expect(await lotQuantity(user, b.id)).toBe(4);
  });

  it("creates a lot on ADD when expiration_date is present and does not duplicate on retry", async () => {
    const user = await bootstrapUser("cmd-newlot");
    const lotId = crypto.randomUUID();
    const operationId = crypto.randomUUID();
    const args = {
      operation_id: operationId,
      product_id: user.productId,
      location_id: user.locationId,
      operation_type: "ADD",
      allocations: [
        {
          inventory_lot_id: lotId,
          delta: 4,
          expiration_date: "2027-03-15",
        },
      ],
    };

    expect((await applyCommand(user.token, args)).body).toEqual({
      ok: true,
      status: "applied",
      operation_id: operationId,
    });
    expect((await applyCommand(user.token, args)).body).toEqual({
      ok: true,
      status: "already_applied",
      operation_id: operationId,
    });

    const lots = await restGet<{ id: string; quantity: number; expiration_date: string }[]>(
      user.token,
      `inventory_lots?id=eq.${lotId}&select=id,quantity,expiration_date`,
    );
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({
      id: lotId,
      quantity: 4,
      expiration_date: "2027-03-15",
    });
  });

  it("serializes overlapping removals so stock cannot go negative", async () => {
    const user = await bootstrapUser("cmd-conc");
    const shared = await addLot(user, 1);
    const extra = await addLot(user, 3);

    const results = await Promise.all([
      applyCommand(user.token, {
        operation_id: crypto.randomUUID(),
        product_id: user.productId,
        location_id: user.locationId,
        operation_type: "REMOVE",
        allocations: [
          { inventory_lot_id: extra.id, delta: -1 },
          { inventory_lot_id: shared.id, delta: -1 },
        ],
      }),
      applyCommand(user.token, {
        operation_id: crypto.randomUUID(),
        product_id: user.productId,
        location_id: user.locationId,
        operation_type: "REMOVE",
        allocations: [{ inventory_lot_id: shared.id, delta: -1 }],
      }),
    ]);

    const applied = results.filter(
      (row) => (row.body as { status?: string }).status === "applied",
    );
    const failed = results.filter(
      (row) => (row.body as { code?: string }).code === "insufficient_stock",
    );
    expect(applied).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(await lotQuantity(user, shared.id)).toBe(0);
    expect(await lotQuantity(user, extra.id)).toBeGreaterThanOrEqual(2);
  });

  it("locks lots in id order so opposite allocation order does not deadlock", async () => {
    const user = await bootstrapUser("cmd-lock");
    const first = await addLot(user, 2, "2027-01-01");
    const second = await addLot(user, 2, "2027-12-01");
    const [low, high] =
      first.id < second.id ? [first, second] : [second, first];

    const results = await Promise.all([
      applyCommand(user.token, {
        operation_id: crypto.randomUUID(),
        product_id: user.productId,
        location_id: user.locationId,
        operation_type: "REMOVE",
        allocations: [
          { inventory_lot_id: high.id, delta: -1 },
          { inventory_lot_id: low.id, delta: -1 },
        ],
      }),
      applyCommand(user.token, {
        operation_id: crypto.randomUUID(),
        product_id: user.productId,
        location_id: user.locationId,
        operation_type: "REMOVE",
        allocations: [
          { inventory_lot_id: low.id, delta: -1 },
          { inventory_lot_id: high.id, delta: -1 },
        ],
      }),
    ]);

    expect(results.every((row) => row.status === 200)).toBe(true);
    expect(
      results.every((row) => (row.body as { ok?: boolean }).ok === true),
    ).toBe(true);
    expect(await lotQuantity(user, low.id)).toBe(0);
    expect(await lotQuantity(user, high.id)).toBe(0);
  });

  it("blocks household B resources and anonymous execute", async () => {
    const userA = await bootstrapUser("cmd-sec-a");
    const userB = await bootstrapUser("cmd-sec-b");
    const lotB = await addLot(userB, 6);

    expect(
      (
        await applyCommand(userA.token, {
          operation_id: crypto.randomUUID(),
          product_id: userB.productId,
          location_id: userB.locationId,
          operation_type: "REMOVE",
          allocations: [{ inventory_lot_id: lotB.id, delta: -1 }],
        })
      ).body,
    ).toEqual({ ok: false, code: "unauthorized" });

    expect(
      (
        await applyCommand(userA.token, {
          operation_id: crypto.randomUUID(),
          product_id: userA.productId,
          location_id: userB.locationId,
          operation_type: "ADD",
          allocations: [{ inventory_lot_id: lotB.id, delta: 1 }],
        })
      ).body,
    ).toEqual({ ok: false, code: "invalid_location" });

    const hiddenLots = await restGet<unknown[]>(
      userA.token,
      `inventory_lots?household_id=eq.${userB.householdId}&select=id`,
    );
    expect(hiddenLots).toEqual([]);

    const hiddenLines = await restGet<unknown[]>(
      userA.token,
      `inventory_operation_lots?household_id=eq.${userB.householdId}&select=operation_id`,
    );
    expect(hiddenLines).toEqual([]);

    const anon = await fetch(`${API}/rest/v1/rpc/apply_inventory_command`, {
      method: "POST",
      headers: {
        apikey: LOCAL_ANON,
        Authorization: `Bearer ${LOCAL_ANON}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_operation_id: crypto.randomUUID(),
        p_product_id: userB.productId,
        p_location_id: userB.locationId,
        p_operation_type: "ADD",
        p_allocations: [{ inventory_lot_id: lotB.id, delta: 1 }],
      }),
    });
    expect([401, 403]).toContain(anon.status);
    expect(await lotQuantity(userB, lotB.id)).toBe(6);

    expect(sql(`select has_function_privilege('anon', '${COMMAND_SIG}', 'execute');`)).toBe(
      "f",
    );
    expect(
      sql(`select has_function_privilege('authenticated', '${COMMAND_SIG}', 'execute');`),
    ).toBe("t");
  });

  it("rejects ADD/REMOVE net-zero allocations and ADJUST", async () => {
    const user = await bootstrapUser("cmd-netzero");
    const lot = await addLot(user, 4);

    expect(
      (
        await applyCommand(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: user.productId,
          location_id: user.locationId,
          operation_type: "ADD",
          allocations: [
            { inventory_lot_id: lot.id, delta: 2 },
            { inventory_lot_id: crypto.randomUUID(), delta: -2, expiration_date: null },
          ],
        })
      ).body,
    ).toEqual({ ok: false, code: "invalid_operation" });

    expect(
      (
        await applyCommand(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: user.productId,
          location_id: user.locationId,
          operation_type: "REMOVE",
          allocations: [
            { inventory_lot_id: lot.id, delta: -1 },
            { inventory_lot_id: crypto.randomUUID(), delta: 1 },
          ],
        })
      ).body,
    ).toEqual({ ok: false, code: "invalid_operation" });

    expect(
      (
        await applyCommand(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: user.productId,
          location_id: user.locationId,
          operation_type: "ADJUST",
          allocations: [{ inventory_lot_id: lot.id, delta: 1 }],
        })
      ).body,
    ).toEqual({ ok: false, code: "invalid_operation" });
    expect(await lotQuantity(user, lot.id)).toBe(4);
  });

  it("moves stock atomically with one MOVE parent and matching lines", async () => {
    const user = await bootstrapUser("cmd-move");
    const dest = await createLocation(user, `Pantry ${Date.now()}`);
    const source = await addLot(user, 5, "2027-01-10");
    const destLotId = crypto.randomUUID();
    const operationId = crypto.randomUUID();

    expect(
      (
        await applyCommand(user.token, {
          operation_id: operationId,
          product_id: user.productId,
          location_id: user.locationId,
          operation_type: "MOVE",
          allocations: [
            { inventory_lot_id: source.id, location_id: user.locationId, delta: -3 },
            {
              inventory_lot_id: destLotId,
              location_id: dest.id,
              delta: 3,
              expiration_date: "2027-01-10",
            },
          ],
        })
      ).body,
    ).toEqual({ ok: true, status: "applied", operation_id: operationId });

    expect(await lotQuantity(user, source.id)).toBe(2);
    const destLots = await restGet<
      { id: string; quantity: number; location_id: string; expiration_date: string }[]
    >(
      user.token,
      `inventory_lots?id=eq.${destLotId}&select=id,quantity,location_id,expiration_date`,
    );
    expect(destLots).toEqual([
      {
        id: destLotId,
        quantity: 3,
        location_id: dest.id,
        expiration_date: "2027-01-10",
      },
    ]);

    const parent = await restGet<
      {
        operation_type: string;
        delta: number;
        inventory_lot_id: string | null;
        location_id: string;
      }[]
    >(
      user.token,
      `inventory_operations?operation_id=eq.${operationId}&select=operation_type,delta,inventory_lot_id,location_id`,
    );
    expect(parent).toEqual([
      {
        operation_type: "MOVE",
        delta: 3,
        inventory_lot_id: null,
        location_id: user.locationId,
      },
    ]);
    const lines = await restGet<{ inventory_lot_id: string; delta: number }[]>(
      user.token,
      `inventory_operation_lots?operation_id=eq.${operationId}&select=inventory_lot_id,delta`,
    );
    expect(lines).toHaveLength(2);
    expect(lines.sort((a, b) => a.delta - b.delta)).toEqual([
      { inventory_lot_id: source.id, delta: -3 },
      { inventory_lot_id: destLotId, delta: 3 },
    ]);
  });

  it("merges a destination lot or creates one at the destination location", async () => {
    const user = await bootstrapUser("cmd-move-merge");
    const dest = await createLocation(user, `Pantry ${Date.now()}`);
    const sourceSoon = await addLot(user, 2, "2027-01-10");
    const sourceLater = await addLot(user, 2, "2027-06-20");
    const destSoon = await addLot(user, 1, "2027-01-10", dest.id);
    const newLaterId = crypto.randomUUID();
    const operationId = crypto.randomUUID();

    expect(
      (
        await applyCommand(user.token, {
          operation_id: operationId,
          product_id: user.productId,
          location_id: user.locationId,
          operation_type: "MOVE",
          allocations: [
            { inventory_lot_id: sourceSoon.id, location_id: user.locationId, delta: -2 },
            { inventory_lot_id: sourceLater.id, location_id: user.locationId, delta: -1 },
            { inventory_lot_id: destSoon.id, location_id: dest.id, delta: 2, expiration_date: "2027-01-10" },
            {
              inventory_lot_id: newLaterId,
              location_id: dest.id,
              delta: 1,
              expiration_date: "2027-06-20",
            },
          ],
        })
      ).body,
    ).toEqual({ ok: true, status: "applied", operation_id: operationId });

    expect(await lotQuantity(user, sourceSoon.id)).toBe(0);
    expect(await lotQuantity(user, sourceLater.id)).toBe(1);
    expect(await lotQuantity(user, destSoon.id)).toBe(3);
    const created = await restGet<{ location_id: string; quantity: number }[]>(
      user.token,
      `inventory_lots?id=eq.${newLaterId}&select=location_id,quantity`,
    );
    expect(created).toEqual([{ location_id: dest.id, quantity: 1 }]);
  });

  it("rejects insufficient MOVE stock without changing the destination", async () => {
    const user = await bootstrapUser("cmd-move-short");
    const dest = await createLocation(user, `Pantry ${Date.now()}`);
    const source = await addLot(user, 1);
    const destLot = await addLot(user, 5, null, dest.id);

    expect(
      (
        await applyCommand(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: user.productId,
          location_id: user.locationId,
          operation_type: "MOVE",
          allocations: [
            { inventory_lot_id: source.id, location_id: user.locationId, delta: -2 },
            { inventory_lot_id: destLot.id, location_id: dest.id, delta: 2 },
          ],
        })
      ).body,
    ).toEqual({ ok: false, code: "insufficient_stock" });
    expect(await lotQuantity(user, source.id)).toBe(1);
    expect(await lotQuantity(user, destLot.id)).toBe(5);
    const history = await restGet<unknown[]>(user.token, "inventory_operations?select=id");
    expect(history).toHaveLength(0);
  });

  it("rejects same-location, missing location_id, and unbalanced MOVE lines", async () => {
    const user = await bootstrapUser("cmd-move-bad");
    const dest = await createLocation(user, `Pantry ${Date.now()}`);
    const source = await addLot(user, 4);
    const destLot = await addLot(user, 1, null, dest.id);

    expect(
      (
        await applyCommand(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: user.productId,
          location_id: user.locationId,
          operation_type: "MOVE",
          allocations: [
            { inventory_lot_id: source.id, location_id: user.locationId, delta: -1 },
            { inventory_lot_id: destLot.id, location_id: user.locationId, delta: 1 },
          ],
        })
      ).body,
    ).toEqual({ ok: false, code: "invalid_move" });

    expect(
      (
        await applyCommand(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: user.productId,
          location_id: user.locationId,
          operation_type: "MOVE",
          allocations: [
            { inventory_lot_id: source.id, delta: -1 },
            { inventory_lot_id: destLot.id, delta: 1 },
          ],
        })
      ).body,
    ).toEqual({ ok: false, code: "invalid_operation" });

    expect(
      (
        await applyCommand(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: user.productId,
          location_id: user.locationId,
          operation_type: "MOVE",
          allocations: [
            { inventory_lot_id: source.id, location_id: user.locationId, delta: -2 },
            { inventory_lot_id: destLot.id, location_id: dest.id, delta: 1 },
          ],
        })
      ).body,
    ).toEqual({ ok: false, code: "invalid_quantity" });
    expect(await lotQuantity(user, source.id)).toBe(4);
    expect(await lotQuantity(user, destLot.id)).toBe(1);
  });

  it("retries an identical MOVE without changing inventory", async () => {
    const user = await bootstrapUser("cmd-move-idem");
    const dest = await createLocation(user, `Pantry ${Date.now()}`);
    const source = await addLot(user, 4);
    const destLot = await addLot(user, 1, null, dest.id);
    const operationId = crypto.randomUUID();
    const args = {
      operation_id: operationId,
      product_id: user.productId,
      location_id: user.locationId,
      operation_type: "MOVE",
      allocations: [
        { inventory_lot_id: source.id, location_id: user.locationId, delta: -2 },
        { inventory_lot_id: destLot.id, location_id: dest.id, delta: 2 },
      ],
    };

    expect((await applyCommand(user.token, args)).body).toEqual({
      ok: true,
      status: "applied",
      operation_id: operationId,
    });
    expect((await applyCommand(user.token, args)).body).toEqual({
      ok: true,
      status: "already_applied",
      operation_id: operationId,
    });
    expect(await lotQuantity(user, source.id)).toBe(2);
    expect(await lotQuantity(user, destLot.id)).toBe(3);
  });
});
