import { redirect } from "next/navigation";
import { getOwnHouseholdId } from "@/lib/supabase/household";
import { createClient } from "@/lib/supabase/server";

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
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (typeof userId !== "string" || userId.trim() === "") {
    redirect("/login");
  }
  return { householdId, userId };
}
