import { createClient } from "@/lib/supabase/server";

export async function getOwnHouseholdId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .maybeSingle();

  if (error || !data?.household_id) {
    return null;
  }

  return data.household_id;
}
