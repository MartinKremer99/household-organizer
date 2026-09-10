import { test } from "@playwright/test";
import { detectLocalSupabase } from "./local-supabase";

export async function skipIfNoLocalSupabase(): Promise<void> {
  test.skip((await detectLocalSupabase()) === null, "local Supabase is not running");
}
