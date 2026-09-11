import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { detectLocalSupabase } from "./local";

const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const COMMAND_SIG =
  "public.apply_catalog_command(uuid,text,jsonb,timestamp with time zone)";

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

function sql(query: string): string {
  return execFileSync("psql", [DB, "-At", "-c", query], { encoding: "utf8" }).trim();
}

describe.skipIf(!supabaseUp)("apply_catalog_command", () => {
  it("creates, retries, and rejects duplicate names without a client household id", async () => {
    const token = await signUp(`cat-${Date.now()}@example.test`, "password-123456");
    const created = await rpc(token, "create_household", { p_name: "Catalog house" });
    expect(created.status).toBe(200);

    const operationId = crypto.randomUUID();
    const categoryId = crypto.randomUUID();
    const args = {
      p_operation_id: operationId,
      p_operation_type: "CREATE_CATEGORY",
      p_payload: { id: categoryId, name: "Snacks" },
      p_client_created_at: "2026-09-10T12:00:00Z",
    };
    const first = await rpc(token, "apply_catalog_command", args);
    expect(first.body).toMatchObject({ ok: true, status: "applied" });
    const retry = await rpc(token, "apply_catalog_command", args);
    expect(retry.body).toMatchObject({ ok: true, status: "already_applied" });

    const duplicate = await rpc(token, "apply_catalog_command", {
      p_operation_id: crypto.randomUUID(),
      p_operation_type: "CREATE_CATEGORY",
      p_payload: { id: crypto.randomUUID(), name: "snacks" },
      p_client_created_at: "2026-09-10T12:00:00Z",
    });
    expect(duplicate.body).toMatchObject({ ok: false, code: "duplicate_name" });

    expect(JSON.stringify(args)).not.toContain("household_id");
    expect(sql(`select has_function_privilege('anon', '${COMMAND_SIG}', 'execute');`)).toBe("f");
    expect(
      sql(`select has_function_privilege('authenticated', '${COMMAND_SIG}', 'execute');`),
    ).toBe("t");
  });

  it("stores a barcode, replays the same product, and rejects a household barcode clash", async () => {
    const token = await signUp(`cat-bar-${Date.now()}@example.test`, "password-123456");
    await rpc(token, "create_household", { p_name: "Barcode house" });
    const categoryId = crypto.randomUUID();
    const category = await rpc(token, "apply_catalog_command", {
      p_operation_id: crypto.randomUUID(),
      p_operation_type: "CREATE_CATEGORY",
      p_payload: { id: categoryId, name: "Barcode drinks" },
      p_client_created_at: "2026-09-11T08:00:00Z",
    });
    expect(category.body).toMatchObject({ ok: true });

    const productId = crypto.randomUUID();
    const operationId = crypto.randomUUID();
    const createArgs = {
      p_operation_id: operationId,
      p_operation_type: "CREATE_PRODUCT",
      p_payload: {
        id: productId,
        name: "Cola",
        category_id: categoryId,
        minimum_stock: 0,
        barcode: "5449000000996",
      },
      p_client_created_at: "2026-09-11T08:00:00Z",
    };
    const first = await rpc(token, "apply_catalog_command", createArgs);
    expect(first.body).toMatchObject({ ok: true, status: "applied" });
    const retry = await rpc(token, "apply_catalog_command", createArgs);
    expect(retry.body).toMatchObject({ ok: true, status: "already_applied" });

    const clash = await rpc(token, "apply_catalog_command", {
      p_operation_id: crypto.randomUUID(),
      p_operation_type: "CREATE_PRODUCT",
      p_payload: {
        id: crypto.randomUUID(),
        name: "Diet cola",
        category_id: categoryId,
        minimum_stock: 0,
        barcode: "5449000000996",
      },
      p_client_created_at: "2026-09-11T08:00:00Z",
    });
    expect(clash.body).toMatchObject({ ok: false, code: "duplicate_barcode" });
    expect(clash.body).not.toMatchObject({ code: "duplicate_name" });
  });

  it("rejects another household's user", async () => {
    const a = await signUp(`cat-a-${Date.now()}@example.test`, "password-123456");
    const b = await signUp(`cat-b-${Date.now()}@example.test`, "password-123456");
    await rpc(a, "create_household", { p_name: "A" });
    await rpc(b, "create_household", { p_name: "B" });

    const categoryId = crypto.randomUUID();
    const created = await rpc(a, "apply_catalog_command", {
      p_operation_id: crypto.randomUUID(),
      p_operation_type: "CREATE_CATEGORY",
      p_payload: { id: categoryId, name: "A only" },
      p_client_created_at: "2026-09-10T12:00:00Z",
    });
    expect(created.body).toMatchObject({ ok: true });

    const rename = await rpc(b, "apply_catalog_command", {
      p_operation_id: crypto.randomUUID(),
      p_operation_type: "RENAME_CATEGORY",
      p_payload: { id: categoryId, name: "Stolen" },
      p_client_created_at: "2026-09-10T12:00:00Z",
    });
    expect(rename.body).toMatchObject({ ok: false, code: "not_found" });
  });
});
