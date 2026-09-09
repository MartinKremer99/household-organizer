"use client";

import { useActionState } from "react";
import { createHousehold, type AuthFormState } from "@/lib/supabase/actions";

const initialState: AuthFormState = {};

export function SetupForm() {
  const [state, formAction, isPending] = useActionState(
    createHousehold,
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          Household name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="organization"
          required
          maxLength={80}
          className="rounded-md border border-foreground/20 bg-background px-3 py-2"
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-60"
      >
        {isPending ? "Creating…" : "Create household"}
      </button>
    </form>
  );
}
