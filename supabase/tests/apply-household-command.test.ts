import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const COMMAND_SIG =
  "public.apply_household_command(uuid,text,jsonb,timestamp with time zone)";

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
    Prefer: "return=representation",
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

describe.skipIf(!supabaseUp)("apply_household_command", () => {
  it("renames, retries, and rejects invalid reuse without a client household id", async () => {
    const token = await signUp(`hh-${Date.now()}@example.test`, "password-123456");
    const created = await rpc(token, "create_household", { p_name: "Original" });
    expect(created.status).toBe(200);
    const householdId = created.body as string;

    const operationId = crypto.randomUUID();
    const args = {
      p_operation_id: operationId,
      p_operation_type: "RENAME_HOUSEHOLD",
      p_payload: { name: "Renamed" },
      p_client_created_at: "2026-09-10T12:00:00Z",
    };
    const first = await rpc(token, "apply_household_command", args);
    expect(first.body).toMatchObject({ ok: true, status: "applied" });
    expect(
      sql(`select name from public.households where id = '${householdId}';`),
    ).toBe("Renamed");

    const retry = await rpc(token, "apply_household_command", args);
    expect(retry.body).toMatchObject({ ok: true, status: "already_applied" });

    const conflict = await rpc(token, "apply_household_command", {
      ...args,
      p_payload: { name: "Other" },
    });
    expect(conflict.body).toMatchObject({ ok: false, code: "conflict" });

    const invalid = await rpc(token, "apply_household_command", {
      p_operation_id: crypto.randomUUID(),
      p_operation_type: "RENAME_HOUSEHOLD",
      p_payload: { name: "   " },
      p_client_created_at: "2026-09-10T12:00:00Z",
    });
    expect(invalid.body).toMatchObject({ ok: false, code: "invalid_name" });

    const unknown = await rpc(token, "apply_household_command", {
      p_operation_id: crypto.randomUUID(),
      p_operation_type: "ROTATE_JOIN_CODE",
      p_payload: { name: "Nope" },
      p_client_created_at: "2026-09-10T12:00:00Z",
    });
    expect(unknown.body).toMatchObject({ ok: false, code: "invalid_operation" });

    expect(JSON.stringify(args)).not.toContain("household_id");
    expect(sql(`select has_function_privilege('anon', '${COMMAND_SIG}', 'execute');`)).toBe(
      "f",
    );
    expect(
      sql(`select has_function_privilege('authenticated', '${COMMAND_SIG}', 'execute');`),
    ).toBe("t");

    const patch = await fetch(`${API}/rest/v1/households?id=eq.${householdId}`, {
      method: "PATCH",
      headers: headers(token),
      body: JSON.stringify({ name: "Patched" }),
    });
    const patched = await parseJson(patch);
    if (patch.status < 400) {
      expect(patched === null || (Array.isArray(patched) && patched.length === 0)).toBe(
        true,
      );
    }
    expect(
      sql(`select name from public.households where id = '${householdId}';`),
    ).toBe("Renamed");
  });

  it("cannot change another household's name", async () => {
    const a = await signUp(`hh-a-${Date.now()}@example.test`, "password-123456");
    const c = await signUp(`hh-c-${Date.now()}@example.test`, "password-123456");
    const createdA = await rpc(a, "create_household", { p_name: "A house" });
    const createdC = await rpc(c, "create_household", { p_name: "C house" });
    expect(createdA.status).toBe(200);
    expect(createdC.status).toBe(200);
    const householdA = createdA.body as string;

    const renamed = await rpc(c, "apply_household_command", {
      p_operation_id: crypto.randomUUID(),
      p_operation_type: "RENAME_HOUSEHOLD",
      p_payload: { name: "Stolen", household_id: householdA },
      p_client_created_at: "2026-09-10T12:00:00Z",
    });
    expect(renamed.body).toMatchObject({ ok: true, status: "applied" });
    expect(sql(`select name from public.households where id = '${householdA}';`)).toBe(
      "A house",
    );
  });
});
