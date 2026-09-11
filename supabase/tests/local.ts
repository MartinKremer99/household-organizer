import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LOCAL_API = "http://127.0.0.1:54321";
const LOCK_PATH = join(tmpdir(), "household-organizer-local-supabase.lock");

export type LocalSupabaseEnv = {
  api: string;
  anon: string;
};

let cached: LocalSupabaseEnv | null | undefined;

function isLocalApi(api: string): boolean {
  return api.startsWith("http://127.0.0.1:") || api.startsWith("http://localhost:");
}

function fromDotEnvLocal(): LocalSupabaseEnv | null {
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    const values = new Map<string, string>();
    for (const line of raw.split("\n")) {
      if (!line || line.startsWith("#") || !line.includes("=")) {
        continue;
      }
      const index = line.indexOf("=");
      values.set(
        line.slice(0, index).trim(),
        line.slice(index + 1).trim().replace(/^['"]|['"]$/g, ""),
      );
    }
    const api = values.get("NEXT_PUBLIC_SUPABASE_URL") ?? LOCAL_API;
    const anon = values.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    if (!anon || !isLocalApi(api)) {
      return null;
    }
    return { api, anon };
  } catch {
    return null;
  }
}

function fromProcessEnv(): LocalSupabaseEnv | null {
  const api = process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_API;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!anon || !isLocalApi(api)) {
    return null;
  }
  return { api, anon };
}

function localSupabaseEnv(): LocalSupabaseEnv | null {
  const fromFiles = fromDotEnvLocal() ?? fromProcessEnv();
  if (fromFiles) {
    return fromFiles;
  }

  try {
    const output = execFileSync("npx", ["supabase", "status", "-o", "env"], {
      encoding: "utf8",
      timeout: 60_000,
    });
    const value = (name: string) =>
      output.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.replace(/^['"]|['"]$/g, "");
    const api = value("API_URL") ?? value("SUPABASE_URL") ?? LOCAL_API;
    const anon = value("ANON_KEY") ?? value("SUPABASE_ANON_KEY");
    if (!anon || !isLocalApi(api)) {
      return null;
    }
    return { api, anon };
  } catch {
    return null;
  }
}

async function withStatusLock<T>(run: () => T): Promise<T> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      writeFileSync(LOCK_PATH, String(process.pid), { flag: "wx" });
      try {
        return run();
      } finally {
        try {
          unlinkSync(LOCK_PATH);
        } catch {
          // The lock is best-effort.
        }
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  return run();
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

  cached = await withStatusLock(() => localSupabaseEnv());
  return cached;
}
