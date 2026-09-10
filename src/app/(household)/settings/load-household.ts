import { redirect } from "next/navigation";
import { getOwnHouseholdId } from "@/lib/supabase/household";
import { createClient } from "@/lib/supabase/server";
import { getLiveUserId } from "@/lib/supabase/session";

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
  const supabase = await createClient();
  const userId = await getLiveUserId(supabase.auth);
  if (!userId) {
    redirect("/login");
  }
  return { householdId, userId };
}
