import { redirect } from "next/navigation";
import { SettingsLink } from "@/components/layout/settings-link";
import { HouseholdAppChrome } from "@/features/household/ui/household-app-chrome";
import { SyncStatusControl } from "@/features/sync/ui/sync-status-control";
import { getOwnHouseholdId } from "@/lib/supabase/household";
import { getLiveUserIdFromCookies } from "@/lib/supabase/session";

export default async function HouseholdLayout({
  children,
}: LayoutProps<"/">) {
  const userId = await getLiveUserIdFromCookies();

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
      actions={<SettingsLink />}
    >
      {children}
    </HouseholdAppChrome>
  );
}
