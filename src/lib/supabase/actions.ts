"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOwnHouseholdId } from "@/lib/supabase/household";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = { error?: string };

// Public registration is intentionally absent. Invite/admin signup can call
// supabase.auth.signUp later; do not re-export it as a Server Action.

function mapAuthError(code: string | undefined): string {
  switch (code) {
    case "invalid_credentials":
      return "Invalid email or password.";
    case "email_address_invalid":
      return "Enter a valid email address.";
    case "validation_failed":
      return "Check your email and password.";
    default:
      return "Something went wrong. Try again.";
  }
}

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: mapAuthError(error.code) };
  }

  revalidatePath("/", "layout");
  const householdId = await getOwnHouseholdId();
  redirect(householdId ? "/" : "/household/setup");
}

function mapHouseholdError(message: string | undefined): string {
  if (message?.includes("already_member")) {
    return "You already belong to a household.";
  }
  if (message?.includes("invalid_name")) {
    return "Enter a household name (1–80 characters).";
  }
  if (message?.includes("invalid_join_code")) {
    return "Invalid join code.";
  }
  return "Something went wrong. Try again.";
}

export async function createHousehold(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const name = String(formData.get("name") ?? "").trim();

  if (!name || name.length > 80) {
    return { error: "Enter a household name (1–80 characters)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_household", { p_name: name });

  if (error) {
    return { error: mapHouseholdError(error.message) };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function joinHousehold(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const joinCode = String(formData.get("joinCode") ?? "").trim();

  if (!joinCode) {
    return { error: "Invalid join code." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("join_household", { p_join_code: joinCode });

  if (error) {
    return { error: mapHouseholdError(error.message) };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims) {
    await supabase.auth.signOut();
  }

  revalidatePath("/", "layout");
  redirect("/login");
}
