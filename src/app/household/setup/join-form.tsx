"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { joinHousehold, type AuthFormState } from "@/lib/supabase/actions";

const initialState: AuthFormState = {};

export function JoinForm() {
  const [state, formAction, isPending] = useActionState(
    joinHousehold,
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <TextField
        id="joinCode"
        name="joinCode"
        label="Join code"
        type="text"
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="characters"
        required
        maxLength={10}
        className="font-mono"
      />
      {state.error ? (
        <p role="alert" className="text-body text-danger">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Joining…" : "Join household"}
      </Button>
    </form>
  );
}
