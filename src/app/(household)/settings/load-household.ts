import { redirect } from "next/navigation";
import { getOwnHouseholdId } from "@/lib/supabase/household";
import { getLiveUserIdFromCookies } from "@/lib/supabase/session";

export async function requireHouseholdId(): Promise<string> {
  const householdId = await getOwnHouseholdId();
  if (!householdId) {
    redirect("/household/setup");
  }
  return householdId;
}

export async function requireHouseholdActor(): Promise<{
  householdId: string;
  userId: string;
}> {
  const householdId = await requireHouseholdId();
  const userId = await getLiveUserIdFromCookies();
  if (!userId) {
    redirect("/login");
  }
  return { householdId, userId };
}
