import { redirect } from "next/navigation";
import { signOut } from "@/lib/supabase/actions";
import { getOwnHouseholdId } from "@/lib/supabase/household";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email =
    typeof data?.claims?.email === "string" ? data.claims.email : undefined;

  if (!data?.claims) {
    redirect("/login");
  }

  const householdId = await getOwnHouseholdId();
  if (!householdId) {
    redirect("/household/setup");
  }

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        Household Organizer
      </h1>
      {email ? <p className="text-sm">Signed in as {email}</p> : null}
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-md border border-foreground/20 px-3 py-2 text-sm"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
