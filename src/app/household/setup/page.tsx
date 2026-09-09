import { redirect } from "next/navigation";
import { getOwnHouseholdId } from "@/lib/supabase/household";
import { createClient } from "@/lib/supabase/server";
import { JoinForm } from "./join-form";
import { SetupForm } from "./setup-form";

export default async function HouseholdSetupPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/login");
  }

  const householdId = await getOwnHouseholdId();
  if (householdId) {
    redirect("/");
  }

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Set up household</h1>
      <section className="flex w-full max-w-sm flex-col gap-4">
        <h2 className="text-lg font-medium">Create a household</h2>
        <SetupForm />
      </section>
      <section className="flex w-full max-w-sm flex-col gap-4">
        <h2 className="text-lg font-medium">Join a household</h2>
        <JoinForm />
      </section>
    </main>
  );
}
