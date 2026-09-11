import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { detectLocalSupabase } from "./local";

const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const COMMAND_SIG =
  "public.put_away_purchased_stock(uuid,uuid,uuid,integer,date,timestamp with time zone)";

type Json = Record<string, unknown>;

type HouseholdContext = {
  token: string;
  userId: string;
  householdId: string;
  productId: string;
  locationId: string;
};

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

function userIdFromToken(token: string): string {
  const payload = token.split(".")[1] ?? "";
  return (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub: string })
    .sub;
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

async function restPatch(token: string, table: string, query: string, row: Json): Promise<void> {
  const response = await fetch(`${API}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: headers(token),
    body: JSON.stringify(row),
  });
  expect(response.ok, await response.text()).toBe(true);
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

async function putAway(
  token: string,
  args: {
    operation_id: string;
    product_id: string;
    location_id: string;
    quantity: number;
    expiration_date?: string | null;
  },
): Promise<{ status: number; body: unknown }> {
  return rpc(token, "put_away_purchased_stock", {
    p_operation_id: args.operation_id,
    p_product_id: args.product_id,
    p_location_id: args.location_id,
    p_quantity: args.quantity,
    p_expiration_date: args.expiration_date ?? null,
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
    userId: userIdFromToken(token),
    householdId,
    productId: product.id,
    locationId: locations[0].id,
  };
}

async function seedPurchased(
  ctx: HouseholdContext,
  quantity: number,
): Promise<{ id: string; quantity: number }> {
  return restPost(ctx.token, "purchased_stock", {
    id: crypto.randomUUID(),
    household_id: ctx.householdId,
    product_id: ctx.productId,
    quantity,
  });
}

async function seedShopping(
  ctx: HouseholdContext,
  overrides: Json,
): Promise<{ id: string; status: string }> {
  return restPost(ctx.token, "shopping_items", {
    id: crypto.randomUUID(),
    household_id: ctx.householdId,
    quantity: 4,
    status: "PURCHASED",
    created_by: ctx.userId,
    purchased_at: "2026-09-10T10:00:00.000Z",
    purchased_by: ctx.userId,
    ...overrides,
  });
}

async function poolQuantity(ctx: HouseholdContext): Promise<number> {
  const rows = await restGet<{ quantity: number }[]>(
    ctx.token,
    `purchased_stock?product_id=eq.${ctx.productId}&select=quantity`,
  );
  return rows.reduce((sum, row) => sum + row.quantity, 0);
}

async function lotsForProduct(ctx: HouseholdContext) {
  return restGet<{ id: string; quantity: number; expiration_date: string | null }[]>(
    ctx.token,
    `inventory_lots?product_id=eq.${ctx.productId}&select=id,quantity,expiration_date`,
  );
}

async function shoppingRows(ctx: HouseholdContext) {
  return restGet<{ id: string; status: string; free_text: string | null; product_id: string | null }[]>(
    ctx.token,
    `shopping_items?household_id=eq.${ctx.householdId}&select=id,status,free_text,product_id`,
  );
}

function sql(query: string): string {
  return execFileSync("psql", [DB, "-At", "-c", query], { encoding: "utf8" }).trim();
}

function dropRollbackTrigger(): void {
  sql("drop trigger if exists put_away_test_fail_lot on public.inventory_lots;");
  sql("drop function if exists public.put_away_test_fail_lot();");
}

afterEach(() => {
  if (supabaseUp) {
    dropRollbackTrigger();
  }
});

describe.skipIf(!supabaseUp)("put_away_purchased_stock", () => {
  it("puts the full pool away, writes ADD history, and stores product shopping items only", async () => {
    const user = await bootstrapUser("put-full");
    await seedPurchased(user, 4);
    const productItem = await seedShopping(user, {
      product_id: user.productId,
      free_text: null,
      quantity: 4,
    });
    const freeText = await seedShopping(user, {
      product_id: null,
      free_text: "Candles",
      quantity: 1,
    });
    const operationId = crypto.randomUUID();

    expect(
      (
        await putAway(user.token, {
          operation_id: operationId,
          product_id: user.productId,
          location_id: user.locationId,
          quantity: 4,
        })
      ).body,
    ).toEqual({ ok: true, status: "applied", operation_id: operationId });

    expect(await poolQuantity(user)).toBe(0);
    const lots = await lotsForProduct(user);
    expect(lots).toHaveLength(1);
    expect(lots[0]?.quantity).toBe(4);
    expect(lots[0]?.expiration_date).toBeNull();

    const history = await restGet<{ operation_type: string; delta: number; inventory_lot_id: string }[]>(
      user.token,
      `inventory_operations?operation_id=eq.${operationId}&select=operation_type,delta,inventory_lot_id`,
    );
    expect(history).toEqual([
      { operation_type: "ADD", delta: 4, inventory_lot_id: lots[0]?.id },
    ]);
    const lines = await restGet<{ delta: number }[]>(
      user.token,
      `inventory_operation_lots?operation_id=eq.${operationId}&select=delta`,
    );
    expect(lines).toEqual([{ delta: 4 }]);

    const shopping = await shoppingRows(user);
    expect(shopping.find((row) => row.id === productItem.id)?.status).toBe("STORED");
    expect(shopping.find((row) => row.id === freeText.id)?.status).toBe("PURCHASED");
  });

  it("keeps a partial put-away purchased and only adds the requested quantity", async () => {
    const user = await bootstrapUser("put-partial");
    await seedPurchased(user, 4);
    await seedShopping(user, {
      product_id: user.productId,
      free_text: null,
      quantity: 4,
    });

    expect(
      (
        await putAway(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: user.productId,
          location_id: user.locationId,
          quantity: 1,
          expiration_date: "2027-01-10",
        })
      ).body,
    ).toMatchObject({ ok: true, status: "applied" });

    expect(await poolQuantity(user)).toBe(3);
    const lots = await lotsForProduct(user);
    expect(lots).toEqual([
      expect.objectContaining({ quantity: 1, expiration_date: "2027-01-10" }),
    ]);
    expect((await shoppingRows(user))[0]?.status).toBe("PURCHASED");
  });

  it("merges matching expiration lots and splits different dates", async () => {
    const user = await bootstrapUser("put-exp");
    await seedPurchased(user, 5);
    await restPost(user.token, "inventory_lots", {
      household_id: user.householdId,
      product_id: user.productId,
      location_id: user.locationId,
      quantity: 2,
      expiration_date: null,
    });
    await restPost(user.token, "inventory_lots", {
      household_id: user.householdId,
      product_id: user.productId,
      location_id: user.locationId,
      quantity: 1,
      expiration_date: "2027-01-10",
    });

    await putAway(user.token, {
      operation_id: crypto.randomUUID(),
      product_id: user.productId,
      location_id: user.locationId,
      quantity: 2,
    });
    await putAway(user.token, {
      operation_id: crypto.randomUUID(),
      product_id: user.productId,
      location_id: user.locationId,
      quantity: 1,
      expiration_date: "2027-01-10",
    });
    await putAway(user.token, {
      operation_id: crypto.randomUUID(),
      product_id: user.productId,
      location_id: user.locationId,
      quantity: 2,
      expiration_date: "2027-06-20",
    });

    const lots = await lotsForProduct(user);
    expect(lots).toHaveLength(3);
    expect(lots.find((row) => row.expiration_date === null)?.quantity).toBe(4);
    expect(lots.find((row) => row.expiration_date === "2027-01-10")?.quantity).toBe(2);
    expect(lots.find((row) => row.expiration_date === "2027-06-20")?.quantity).toBe(2);
  });

  it("rejects invalid quantity, insufficient stock, and cross-household references", async () => {
    const user = await bootstrapUser("put-val");
    const other = await bootstrapUser("put-val-b");
    await seedPurchased(user, 2);

    expect(
      (
        await putAway(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: user.productId,
          location_id: user.locationId,
          quantity: 0,
        })
      ).body,
    ).toEqual({ ok: false, code: "invalid_quantity" });

    expect(
      (
        await putAway(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: user.productId,
          location_id: user.locationId,
          quantity: 5,
        })
      ).body,
    ).toEqual({ ok: false, code: "insufficient_stock" });

    expect(
      (
        await putAway(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: crypto.randomUUID(),
          location_id: user.locationId,
          quantity: 1,
        })
      ).body,
    ).toEqual({ ok: false, code: "invalid_product" });

    expect(
      (
        await putAway(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: other.productId,
          location_id: other.locationId,
          quantity: 1,
        })
      ).body,
    ).toEqual({ ok: false, code: "unauthorized" });

    expect(
      (
        await putAway(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: user.productId,
          location_id: other.locationId,
          quantity: 1,
        })
      ).body,
    ).toEqual({ ok: false, code: "invalid_location" });

    expect(await poolQuantity(user)).toBe(2);
    expect(await lotsForProduct(user)).toEqual([]);
  });

  it("allows put-away of an archived product", async () => {
    const user = await bootstrapUser("put-arch");
    await seedPurchased(user, 2);
    await restPatch(user.token, "products", `id=eq.${user.productId}`, {
      is_active: false,
    });

    expect(
      (
        await putAway(user.token, {
          operation_id: crypto.randomUUID(),
          product_id: user.productId,
          location_id: user.locationId,
          quantity: 2,
        })
      ).body,
    ).toMatchObject({ ok: true, status: "applied" });
    expect(await poolQuantity(user)).toBe(0);
  });

  it("is idempotent on the same command and conflicts on a different payload", async () => {
    const user = await bootstrapUser("put-idem");
    await seedPurchased(user, 4);
    const operationId = crypto.randomUUID();
    const args = {
      operation_id: operationId,
      product_id: user.productId,
      location_id: user.locationId,
      quantity: 2,
      expiration_date: "2027-01-10" as const,
    };

    expect((await putAway(user.token, args)).body).toEqual({
      ok: true,
      status: "applied",
      operation_id: operationId,
    });
    expect((await putAway(user.token, args)).body).toEqual({
      ok: true,
      status: "already_applied",
      operation_id: operationId,
    });
    expect(await poolQuantity(user)).toBe(2);
    expect((await lotsForProduct(user))[0]?.quantity).toBe(2);

    expect(
      (
        await putAway(user.token, {
          ...args,
          quantity: 1,
        })
      ).body,
    ).toEqual({ ok: false, code: "conflict" });
    expect(await poolQuantity(user)).toBe(2);
  });

  it("does not let concurrent put-aways over-consume the pool", async () => {
    const user = await bootstrapUser("put-conc");
    await seedPurchased(user, 4);

    const results = await Promise.all([
      putAway(user.token, {
        operation_id: crypto.randomUUID(),
        product_id: user.productId,
        location_id: user.locationId,
        quantity: 3,
      }),
      putAway(user.token, {
        operation_id: crypto.randomUUID(),
        product_id: user.productId,
        location_id: user.locationId,
        quantity: 3,
      }),
    ]);

    const codes = results.map((row) => (row.body as { status?: string; code?: string }).status
      ?? (row.body as { code?: string }).code);
    expect(codes.sort()).toEqual(["applied", "insufficient_stock"]);
    expect(await poolQuantity(user)).toBe(1);
    expect((await lotsForProduct(user))[0]?.quantity).toBe(3);
  });

  it("rolls back purchased stock, lots, history, and shopping when lot persist fails", async () => {
    const user = await bootstrapUser("put-roll");
    await seedPurchased(user, 4);
    await seedShopping(user, {
      product_id: user.productId,
      free_text: null,
      quantity: 4,
    });

    sql(`
      create function public.put_away_test_fail_lot()
      returns trigger
      language plpgsql
      as $fn$
      begin
        raise exception 'put_away_test_fail';
      end;
      $fn$;
      create trigger put_away_test_fail_lot
      before insert or update on public.inventory_lots
      for each row
      when (new.product_id = '${user.productId}'::uuid)
      execute function public.put_away_test_fail_lot();
    `);

    const result = await putAway(user.token, {
      operation_id: crypto.randomUUID(),
      product_id: user.productId,
      location_id: user.locationId,
      quantity: 4,
    });
    expect(result.status).not.toBe(200);
    expect(await poolQuantity(user)).toBe(4);
    expect(await lotsForProduct(user)).toEqual([]);
    expect(
      await restGet<unknown[]>(
        user.token,
        `inventory_operations?product_id=eq.${user.productId}&select=id`,
      ),
    ).toEqual([]);
    expect((await shoppingRows(user))[0]?.status).toBe("PURCHASED");
  });

  it("blocks anon and grants only authenticated execute", async () => {
    const user = await bootstrapUser("put-sec");
    await seedPurchased(user, 2);

    const anon = await fetch(`${API}/rest/v1/rpc/put_away_purchased_stock`, {
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
        p_quantity: 1,
      }),
    });
    expect([401, 403]).toContain(anon.status);
    expect(await poolQuantity(user)).toBe(2);

    expect(sql(`select has_function_privilege('anon', '${COMMAND_SIG}', 'execute');`)).toBe(
      "f",
    );
    expect(
      sql(`select has_function_privilege('authenticated', '${COMMAND_SIG}', 'execute');`),
    ).toBe("t");
  });
});
