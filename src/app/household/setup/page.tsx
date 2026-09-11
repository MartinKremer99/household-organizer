import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/supabase/actions";
import { getOwnHouseholdId } from "@/lib/supabase/household";
import { createClient } from "@/lib/supabase/server";
import { getLiveUserId } from "@/lib/supabase/session";
import { JoinForm } from "./join-form";
import { SetupForm } from "./setup-form";

export default async function HouseholdSetupPage() {
  const supabase = await createClient();
  const userId = await getLiveUserId(supabase.auth);

  if (!userId) {
    redirect("/login");
  }

  const householdId = await getOwnHouseholdId();
  if (householdId) {
    redirect("/");
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <h1 className="text-pretty text-title font-semibold tracking-tight">Set up household</h1>
      <section className="flex w-full max-w-sm flex-col gap-4">
        <h2 className="text-section font-semibold">Create a household</h2>
        <SetupForm />
      </section>
      <section className="flex w-full max-w-sm flex-col gap-4">
        <h2 className="text-section font-semibold">Join a household</h2>
        <JoinForm />
      </section>
      <form action={signOut}>
        <Button type="submit" variant="secondary">
          Sign out
        </Button>
      </form>
    </main>
  );
}
