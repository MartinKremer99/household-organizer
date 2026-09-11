import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

export const HOUSEHOLD_ID_COOKIE = "ho_household_id";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function householdCookieValue(userId: string, householdId: string): string {
  return `${userId}:${householdId}`;
}

export function householdIdFromCookie(
  userId: string,
  raw: string | undefined,
): string | null {
  if (!raw) {
    return null;
  }
  const sep = raw.indexOf(":");
  if (sep <= 0) {
    return null;
  }
  const cookieUser = raw.slice(0, sep);
  const householdId = raw.slice(sep + 1);
  if (cookieUser !== userId) {
    return null;
  }
  if (!UUID_RE.test(cookieUser) || !UUID_RE.test(householdId)) {
    return null;
  }
  return householdId;
}

export function householdCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };
}

export async function setHouseholdIdCookie(userId: string, householdId: string) {
  const store = await cookies();
  store.set(HOUSEHOLD_ID_COOKIE, householdCookieValue(userId, householdId), householdCookieOptions());
}

export async function clearHouseholdIdCookie() {
  const store = await cookies();
  store.delete(HOUSEHOLD_ID_COOKIE);
}

export function clearHouseholdIdCookieOnResponse(response: NextResponse) {
  response.cookies.set(HOUSEHOLD_ID_COOKIE, "", {
    ...householdCookieOptions(),
    maxAge: 0,
  });
  return response;
}
