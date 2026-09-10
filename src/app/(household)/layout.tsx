import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { SettingsLink } from "@/components/layout/settings-link";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/supabase/actions";
import { getOwnHouseholdId } from "@/lib/supabase/household";
import { createClient } from "@/lib/supabase/server";

export default async function HouseholdLayout({
  children,
}: LayoutProps<"/">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/login");
  }

  const householdId = await getOwnHouseholdId();
  if (!householdId) {
    redirect("/household/setup");
  }

  return (
    <AppShell
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
    </AppShell>
  );
}
