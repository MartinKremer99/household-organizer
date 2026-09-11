"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { createHousehold, type AuthFormState } from "@/lib/supabase/actions";

const initialState: AuthFormState = {};

export function SetupForm() {
  const [state, formAction, isPending] = useActionState(
    createHousehold,
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <TextField
        id="name"
        name="name"
        label="Household name"
        type="text"
        autoComplete="organization"
        required
        maxLength={80}
      />
      {state.error ? (
        <p role="alert" className="text-body text-danger">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating…" : "Create household"}
      </Button>
    </form>
  );
}
