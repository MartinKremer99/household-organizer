"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/text-field";
import {
  getLocalHousehold,
  renameHousehold,
} from "@/features/household/application/manage-household";
import { useHouseholdNameRefresh } from "./household-app-chrome";
import { householdSettingsErrorMessage } from "./household-settings-errors";

export type HouseholdSettings = {
  id: string;
  name: string;
  join_code: string;
};

export type HouseholdSettingsScreenApi = {
  getLocalHousehold: typeof getLocalHousehold;
  renameHousehold: typeof renameHousehold;
  copyText: (value: string) => Promise<void>;
};

const defaults: HouseholdSettingsScreenApi = {
  getLocalHousehold,
  renameHousehold,
  copyText: async (value) => {
    await navigator.clipboard.writeText(value);
  },
};

export function HouseholdSettingsScreen({
  householdId,
  email,
  signOutAction,
  api,
}: {
  householdId: string;
  email: string;
  signOutAction: ReactNode;
  api?: Partial<HouseholdSettingsScreenApi>;
}) {
  const client = useMemo(() => ({ ...defaults, ...api }), [api]);
  const refreshHeaderName = useHouseholdNameRefresh();
  const [household, setHousehold] = useState<HouseholdSettings | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorName, setEditorName] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const reload = useCallback(async () => {
    const next = await client.getLocalHousehold();
    setHousehold(
      next
        ? { id: next.id, name: next.name, join_code: next.join_code }
        : null,
    );
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    void client.getLocalHousehold().then((next) => {
      if (cancelled) {
        return;
      }
      setHousehold(
        next
          ? { id: next.id, name: next.name, join_code: next.join_code }
          : null,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  async function saveName() {
    if (editorName === null) {
      return;
    }
    setPending(true);
    setError(null);
    setStatus(null);
    const result = await client.renameHousehold({
      householdId,
      name: editorName,
    });
    setPending(false);
    if (!result.ok) {
      setError(householdSettingsErrorMessage(result.code));
      return;
    }
    setEditorName(null);
    setStatus("Saved.");
    await reload();
    await refreshHeaderName();
  }

  async function copyJoinCode() {
    if (!household) {
      return;
    }
    setError(null);
    setStatus(null);
    try {
      await client.copyText(household.join_code);
      setStatus("Copied.");
    } catch {
      setError("Could not copy. Try again.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      {status ? (
        <p role="status" className="text-sm">
          {status}
        </p>
      ) : null}
      {error && editorName === null ? (
        <p role="alert" className="text-sm">
          {error}
        </p>
      ) : null}

      <Card title="Household">
        {household ? (
          <div className="flex flex-col gap-3">
            <p>
              <span className="text-foreground/70">Name </span>
              {household.name}
            </p>
            <div className="flex flex-col gap-2">
              <p className="text-foreground/70">Join code</p>
              <p className="select-all font-mono text-base tracking-wide text-foreground">
                {household.join_code}
              </p>
              <Button type="button" variant="secondary" onClick={() => void copyJoinCode()}>
                Copy join code
              </Button>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setError(null);
                setEditorName(household.name);
              }}
            >
              Rename
            </Button>
          </div>
        ) : (
          <p>Loading household…</p>
        )}
      </Card>

      <Card title="Account">
        <div className="flex flex-col gap-3">
          <p>
            <span className="text-foreground/70">Email </span>
            {email}
          </p>
          {signOutAction}
        </div>
      </Card>

      <Link
        href="/settings/products"
        aria-label="Products"
        className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        <Card title="Products">Manage household products.</Card>
      </Link>
      <Link
        href="/settings/categories"
        aria-label="Categories"
        className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        <Card title="Categories">Manage household categories.</Card>
      </Link>
      <Link
        href="/settings/locations"
        aria-label="Locations"
        className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        <Card title="Locations">Manage household locations.</Card>
      </Link>

      <Dialog
        open={editorName !== null}
        title="Rename household"
        titleId="household-rename-title"
        onClose={() => setEditorName(null)}
      >
        {editorName !== null ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void saveName();
            }}
          >
            <TextField
              id="household-name"
              label="Household name"
              value={editorName}
              onChange={(event) => setEditorName(event.target.value)}
            />
            {error ? (
              <p role="alert" className="text-sm">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>
                Save
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditorName(null)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>
    </div>
  );
}
