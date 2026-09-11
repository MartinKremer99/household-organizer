import { cookies } from "next/headers";
import { cache } from "react";
import { HOUSEHOLD_ID_COOKIE, householdIdFromCookie } from "@/lib/supabase/household-cookie";
import { createClient } from "@/lib/supabase/server";

export const getOwnHouseholdId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .maybeSingle();

  if (error || !data?.household_id) {
    return null;
  }

  return data.household_id;
});

export const resolveOwnHouseholdId = cache(async (userId: string): Promise<string | null> => {
  const store = await cookies();
  const fromCookie = householdIdFromCookie(userId, store.get(HOUSEHOLD_ID_COOKIE)?.value);
  if (fromCookie) {
    return fromCookie;
  }
  return getOwnHouseholdId();
});
