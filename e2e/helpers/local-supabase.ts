import { execFileSync } from "node:child_process";

const LOCAL_API = "http://127.0.0.1:54321";

export type LocalSupabaseEnv = {
  api: string;
  anon: string;
};

let cached: LocalSupabaseEnv | null | undefined;

function localSupabaseEnv(): LocalSupabaseEnv | null {
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

export async function detectLocalSupabase(): Promise<LocalSupabaseEnv | null> {
  if (cached !== undefined) {
    return cached;
  }

  try {
    const health = await fetch(`${LOCAL_API}/auth/v1/health`);
    if (!health.ok && health.status !== 200) {
      cached = null;
      return cached;
    }
  } catch {
    cached = null;
    return cached;
  }

  cached = localSupabaseEnv();
  return cached;
}

/** Human-only helper. Playwright does not call this. */
export function resetLocalDatabase(): void {
  execFileSync("npx", ["supabase", "db", "reset", "--yes"], {
    stdio: "inherit",
    timeout: 180_000,
  });
}
