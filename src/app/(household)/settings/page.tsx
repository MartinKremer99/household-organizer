import { Button } from "@/components/ui/button";
import { HouseholdSettingsScreen } from "@/features/household/ui/household-settings-screen";
import { signOut } from "@/lib/supabase/actions";
import { createClient } from "@/lib/supabase/server";
import { requireHouseholdId } from "./load-household";

export default async function SettingsPage() {
  const householdId = await requireHouseholdId();
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email ?? "";

  return (
    <HouseholdSettingsScreen
      householdId={householdId}
      email={email}
      signOutAction={
        <form action={signOut}>
          <Button type="submit" variant="danger">
            Sign out
          </Button>
        </form>
      }
    />
  );
}
