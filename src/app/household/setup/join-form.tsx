"use client";

import { useActionState } from "react";
import { joinHousehold, type AuthFormState } from "@/lib/supabase/actions";

const initialState: AuthFormState = {};

export function JoinForm() {
  const [state, formAction, isPending] = useActionState(
    joinHousehold,
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="joinCode" className="text-sm font-medium">
          Join code
        </label>
        <input
          id="joinCode"
          name="joinCode"
          type="text"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="characters"
          required
          maxLength={10}
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
        {isPending ? "Joining…" : "Join household"}
      </button>
    </form>
  );
}
