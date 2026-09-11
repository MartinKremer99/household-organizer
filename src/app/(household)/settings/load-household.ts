import { redirect } from "next/navigation";
import { resolveOwnHouseholdId } from "@/lib/supabase/household";
import { getLiveUserIdFromCookies } from "@/lib/supabase/session";

export async function requireHouseholdId(): Promise<string> {
  const userId = await getLiveUserIdFromCookies();
  if (!userId) {
    redirect("/login");
  }
  const householdId = await resolveOwnHouseholdId(userId);
  if (!householdId) {
    redirect("/household/setup");
  }
  return householdId;
}

export async function requireHouseholdActor(): Promise<{
  householdId: string;
  userId: string;
}> {
  const userId = await getLiveUserIdFromCookies();
  if (!userId) {
    redirect("/login");
  }
  const householdId = await resolveOwnHouseholdId(userId);
  if (!householdId) {
    redirect("/household/setup");
  }
  return { householdId, userId };
}
