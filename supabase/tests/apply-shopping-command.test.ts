import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

type Json = Record<string, unknown>;

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

describe.skipIf(!supabaseUp)("apply_shopping_command", () => {
  it("adds, purchases, retries, and isolates households", async () => {
    const token = await signUp(`shop-${Date.now()}@example.test`, "password-123456");
    const created = await rpc(token, "create_household", { p_name: "Shop house" });
    const householdId = created.body as string;
    const categories = await restGet<{ id: string }[]>(token, "categories?select=id&limit=1");
    const product = await restPost<{ id: string }>(token, "products", {
      household_id: householdId,
      name: `Beans ${Date.now()}`,
      category_id: categories[0].id,
      minimum_stock: 0,
    });

    const itemId = crypto.randomUUID();
    const addArgs = {
      p_operation_id: crypto.randomUUID(),
      p_operation_type: "ADD_SHOPPING_ITEM",
      p_payload: { id: itemId, product_id: product.id, free_text: null, quantity: 2 },
      p_client_created_at: "2026-09-10T12:00:00Z",
    };
    expect((await rpc(token, "apply_shopping_command", addArgs)).body).toMatchObject({
      ok: true,
      status: "applied",
    });
    expect((await rpc(token, "apply_shopping_command", addArgs)).body).toMatchObject({
      ok: true,
      status: "already_applied",
    });

    const purchaseArgs = {
      p_operation_id: crypto.randomUUID(),
      p_operation_type: "MARK_SHOPPING_PURCHASED",
      p_payload: { id: itemId },
      p_client_created_at: "2026-09-10T12:00:00Z",
    };
    expect((await rpc(token, "apply_shopping_command", purchaseArgs)).body).toMatchObject({
      ok: true,
    });

    const other = await signUp(`shop-b-${Date.now()}@example.test`, "password-123456");
    await rpc(other, "create_household", { p_name: "Other" });
    const stolen = await rpc(other, "apply_shopping_command", {
      p_operation_id: crypto.randomUUID(),
      p_operation_type: "CHANGE_SHOPPING_QUANTITY",
      p_payload: { id: itemId, quantity: 9 },
      p_client_created_at: "2026-09-10T12:00:00Z",
    });
    expect(stolen.body).toMatchObject({ ok: false, code: "invalid_shopping_item" });
  });
});
