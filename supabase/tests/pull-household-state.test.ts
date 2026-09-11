import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { detectLocalSupabase } from "./local";

const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

type Json = Record<string, unknown>;

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

async function restPatch(token: string, table: string, query: string, row: Json): Promise<void> {
  const response = await fetch(`${API}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: headers(token),
    body: JSON.stringify(row),
  });
  expect(response.ok, await response.text()).toBe(true);
}

async function rpc(
  token: string | null,
  name: string,
  args: Json = {},
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${API}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: token
      ? headers(token)
      : {
          apikey: LOCAL_ANON,
          Authorization: `Bearer ${LOCAL_ANON}`,
          "Content-Type": "application/json",
        },
    body: JSON.stringify(args),
  });
  return { status: response.status, body: await parseJson(response) };
}

describe.skipIf(!supabaseUp)("pull_household_state", () => {
  it("rejects an unauthenticated caller", async () => {
    const pulled = await rpc(null, "pull_household_state");
    expect(pulled.status).toBeGreaterThanOrEqual(400);
    expect(pulled.body).not.toMatchObject({ ok: true });
    expect(
      execFileSync(
        "psql",
        [
          DB,
          "-At",
          "-c",
          "select has_function_privilege('anon', 'public.pull_household_state()', 'execute');",
        ],
        { encoding: "utf8" },
      ).trim(),
    ).toBe("f");
  });

  it("rejects a user with no household", async () => {
    const email = `pull-none-${Date.now()}@example.test`;
    const token = await signUp(email, "password-123456");
    const pulled = await rpc(token, "pull_household_state");
    expect(pulled.body).toMatchObject({ ok: false, code: "no_household" });
  });

  it("returns seed catalog for the creator and isolates households", async () => {
    const aToken = await signUp(`pull-a-${Date.now()}@example.test`, "password-123456");
    const bToken = await signUp(`pull-b-${Date.now()}@example.test`, "password-123456");
    const createdA = await rpc(aToken, "create_household", { p_name: "A house" });
    const createdB = await rpc(bToken, "create_household", { p_name: "B house" });
    expect(createdA.status).toBe(200);
    expect(createdB.status).toBe(200);

    const pulledA = await rpc(aToken, "pull_household_state");
    const bodyA = pulledA.body as Json;
    expect(bodyA.ok).toBe(true);
    expect(bodyA.household).toMatchObject({ id: createdA.body, name: "A house" });
    const categories = bodyA.categories as Array<{ name: string }>;
    const locations = bodyA.locations as Array<{ name: string }>;
    expect(categories.map((row) => row.name)).toEqual(
      expect.arrayContaining(["Food", "Drinks", "Cleaning", "Personal Care", "Household", "Other"]),
    );
    expect(locations.map((row) => row.name)).toEqual(
      expect.arrayContaining(["Kitchen", "Bathroom", "Cellar", "Living room"]),
    );

    const pulledB = await rpc(bToken, "pull_household_state");
    expect((pulledB.body as Json).household).toMatchObject({ id: createdB.body });
    expect((pulledB.body as Json).household).not.toMatchObject({ id: createdA.body });
  });

  it("lets a joiner see the creator snapshot including archived products and zero lots", async () => {
    const aToken = await signUp(`pull-join-a-${Date.now()}@example.test`, "password-123456");
    const created = await rpc(aToken, "create_household", { p_name: "Shared" });
    const householdId = created.body as string;
    const households = await restGet<{ join_code: string }[]>(
      aToken,
      `households?select=join_code&id=eq.${householdId}`,
    );
    const categories = await restGet<{ id: string }[]>(aToken, "categories?select=id&name=eq.Food");
    const locations = await restGet<{ id: string }[]>(
      aToken,
      "locations?select=id&name=eq.Kitchen",
    );
    const product = await restPost<{ id: string }>(aToken, "products", {
      household_id: householdId,
      name: `Archived flour ${Date.now()}`,
      category_id: categories[0].id,
      minimum_stock: 0,
    });
    await restPatch(aToken, "products", `id=eq.${product.id}`, { is_active: false });
    await restPost(aToken, "inventory_lots", {
      household_id: householdId,
      product_id: product.id,
      location_id: locations[0].id,
      quantity: 0,
    });

    const bToken = await signUp(`pull-join-b-${Date.now()}@example.test`, "password-123456");
    const joined = await rpc(bToken, "join_household", { p_join_code: households[0].join_code });
    expect(joined.status).toBe(200);

    const pulled = await rpc(bToken, "pull_household_state");
    const body = pulled.body as Json;
    expect(body.ok).toBe(true);
    expect(body.household).toMatchObject({ id: householdId });
    const products = body.products as Array<{ id: string; is_active: boolean }>;
    const lots = body.inventory_lots as Array<{ product_id: string; quantity: number }>;
    expect(products.some((row) => row.id === product.id && row.is_active === false)).toBe(true);
    expect(lots.some((row) => row.product_id === product.id && row.quantity === 0)).toBe(true);
  });

  it("does not accept a client household id argument", () => {
    const output = execFileSync(
      "psql",
      [DB, "-tAc", "select pg_get_function_identity_arguments('public.pull_household_state'::regproc)"],
      { encoding: "utf8" },
    );
    expect(output.trim()).toBe("");
  });
});
