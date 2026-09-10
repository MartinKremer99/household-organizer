import { redirect } from "next/navigation";
import { getOwnHouseholdId } from "@/lib/supabase/household";

export async function requireHouseholdId(): Promise<string> {
  const householdId = await getOwnHouseholdId();
  if (!householdId) {
    redirect("/household/setup");
  }
  return householdId;
}
