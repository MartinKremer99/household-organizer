import { cache } from "react";
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
