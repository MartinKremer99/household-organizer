import { redirect } from "next/navigation";
import { SettingsLink } from "@/components/layout/settings-link";
import { Button } from "@/components/ui/button";
import { HouseholdAppChrome } from "@/features/household/ui/household-app-chrome";
import { SyncStatusControl } from "@/features/sync/ui/sync-status-control";
import { signOut } from "@/lib/supabase/actions";
import { getOwnHouseholdId } from "@/lib/supabase/household";
import { createClient } from "@/lib/supabase/server";
import { getLiveUserId } from "@/lib/supabase/session";

export default async function HouseholdLayout({
  children,
}: LayoutProps<"/">) {
  const supabase = await createClient();
  const userId = await getLiveUserId(supabase.auth);

  if (!userId) {
    redirect("/login");
  }

  const householdId = await getOwnHouseholdId();
  if (!householdId) {
    redirect("/household/setup");
  }

  return (
    <HouseholdAppChrome
      userId={userId}
      status={<SyncStatusControl householdId={householdId} />}
      actions={
        <div className="flex items-center gap-2">
          <SettingsLink />
          <form action={signOut}>
            <Button type="submit" variant="secondary">
              Sign out
            </Button>
          </form>
        </div>
      }
    >
      {children}
    </HouseholdAppChrome>
  );
}
