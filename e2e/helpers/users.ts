import { expect } from "@playwright/test";
import { detectLocalSupabase, type LocalSupabaseEnv } from "./local-supabase";

export const E2E_PASSWORD = "password-123456";

export type RegisteredUser = {
  email: string;
  password: string;
  accessToken: string;
};

type HouseholdRow = {
  id: string;
  join_code: string;
};

function uniqueLabel(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function uniqueEmail(label: string): string {
  return `${uniqueLabel(label)}@example.test`;
}

export function uniqueHouseholdName(label: string): string {
  return `${label} house ${uniqueLabel("h")}`.slice(0, 80);
}

async function requireLocal(): Promise<LocalSupabaseEnv> {
  const local = await detectLocalSupabase();
  if (!local) {
    throw new Error("local Supabase is not running");
  }
  return local;
}

function authHeaders(env: LocalSupabaseEnv, token = env.anon): HeadersInit {
  return {
    apikey: env.anon,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function registerUser(label: string): Promise<RegisteredUser> {
  const env = await requireLocal();
  const email = uniqueEmail(label);
  const password = E2E_PASSWORD;

  const signup = await fetch(`${env.api}/auth/v1/signup`, {
    method: "POST",
    headers: authHeaders(env),
    body: JSON.stringify({ email, password }),
  });
  expect(signup.ok, await signup.clone().text()).toBe(true);

  const session = await fetch(`${env.api}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: authHeaders(env),
    body: JSON.stringify({ email, password }),
  });
  const sessionText = await session.text();
  expect(session.ok, sessionText).toBe(true);
  const body = JSON.parse(sessionText) as { access_token?: string };
  expect(body.access_token).toBeTruthy();

  return { email, password, accessToken: body.access_token as string };
}

export async function userRestGet<T>(token: string, path: string): Promise<T> {
  const env = await requireLocal();
  const response = await fetch(`${env.api}/rest/v1/${path}`, {
    headers: authHeaders(env, token),
  });
  const text = await response.text();
  expect(response.ok, text).toBe(true);
  return (text ? JSON.parse(text) : null) as T;
}

export async function listHouseholds(token: string): Promise<HouseholdRow[]> {
  return userRestGet<HouseholdRow[]>(token, "households?select=id,join_code");
}

export async function listInventoryLots(
  token: string,
): Promise<Array<{ id: string; quantity: number }>> {
  return userRestGet<Array<{ id: string; quantity: number }>>(
    token,
    "inventory_lots?select=id,quantity",
  );
}
