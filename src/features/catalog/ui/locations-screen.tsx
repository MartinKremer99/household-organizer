"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  archiveLocation,
  createLocation,
  listActiveLocations,
  renameLocation,
} from "@/features/locations/application/manage-locations";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/text-field";
import { catalogErrorMessage } from "./catalog-errors";
import { CatalogRow } from "./catalog-row";

export type LocationsScreenApi = {
  listActiveLocations: typeof listActiveLocations;
  createLocation: typeof createLocation;
  renameLocation: typeof renameLocation;
  archiveLocation: typeof archiveLocation;
};

type Location = Awaited<ReturnType<LocationsScreenApi["listActiveLocations"]>>[number];

const defaults: LocationsScreenApi = {
  listActiveLocations,
  createLocation,
  renameLocation,
  archiveLocation,
};

type Editor = {
  mode: "create" | "edit";
  location?: Location;
  name: string;
};

export function LocationsScreen({
  householdId,
  api,
}: {
  householdId: string;
  api?: Partial<LocationsScreenApi>;
}) {
  const catalog = useMemo(() => ({ ...defaults, ...api }), [api]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Location | null>(null);
  const [pending, setPending] = useState(false);

  const reload = useCallback(async () => {
    setLocations(await catalog.listActiveLocations(householdId));
  }, [catalog, householdId]);

  useEffect(() => {
    let cancelled = false;
    void catalog.listActiveLocations(householdId).then((next) => {
      if (cancelled) {
        return;
      }
      setLocations(next);
    });
    return () => {
      cancelled = true;
    };
  }, [catalog, householdId]);

  async function saveEditor() {
    if (!editor) {
      return;
    }
    setPending(true);
    setError(null);
    setStatus(null);

    const result =
      editor.mode === "create"
        ? await catalog.createLocation({
            household_id: householdId,
            name: editor.name,
          })
        : await catalog.renameLocation({
            household_id: householdId,
            location_id: editor.location?.id ?? "",
            name: editor.name,
          });

    setPending(false);
    if (!result.ok) {
      setError(catalogErrorMessage(result.code));
      return;
    }
    setEditor(null);
    setStatus("Saved.");
    await reload();
  }

  async function confirmArchive() {
    if (!archiveTarget) {
      return;
    }
    setPending(true);
    setError(null);
    const result = await catalog.archiveLocation({
      household_id: householdId,
      location_id: archiveTarget.id,
    });
    setPending(false);
    if (!result.ok) {
      setError(catalogErrorMessage(result.code));
      return;
    }
    setArchiveTarget(null);
    setStatus("Saved.");
    await reload();
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title font-semibold tracking-tight">Locations</h1>
      <Button
        type="button"
        variant={locations.length === 0 ? "primary" : "secondary"}
        onClick={() => {
          setError(null);
          setEditor({ mode: "create", name: "" });
        }}
      >
        Add location
      </Button>
      {status ? (
        <p role="status" className="text-secondary text-muted-foreground">
          {status}
        </p>
      ) : null}
      {error && !editor && !archiveTarget ? (
        <p role="alert" className="text-body text-danger">
          {error}
        </p>
      ) : null}

      {locations.length === 0 ? (
        <p className="text-secondary text-muted-foreground">No locations yet.</p>
      ) : (
        <ul className="flex flex-col">
          {locations.map((location) => (
            <li key={location.id}>
              <CatalogRow name={location.name}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setError(null);
                    setEditor({
                      mode: "edit",
                      location,
                      name: location.name,
                    });
                  }}
                >
                  Rename {location.name}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    setError(null);
                    setArchiveTarget(location);
                  }}
                >
                  Archive {location.name}
                </Button>
              </CatalogRow>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={editor !== null}
        title={editor?.mode === "edit" ? "Rename location" : "Add location"}
        titleId="location-editor-title"
        onClose={() => setEditor(null)}
      >
        {editor ? (
          <form
            className="flex min-w-0 flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void saveEditor();
            }}
          >
            <TextField
              id="location-name"
              label="Name"
              value={editor.name}
              onChange={(event) =>
                setEditor({ ...editor, name: event.target.value })
              }
            />
            {error ? (
              <p role="alert" className="text-body text-danger">
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
                onClick={() => setEditor(null)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>

      <Dialog
        open={archiveTarget !== null}
        title={archiveTarget ? `Archive ${archiveTarget.name}?` : "Archive"}
        titleId="location-archive-title"
        onClose={() => setArchiveTarget(null)}
      >
        {error ? (
          <p role="alert" className="mb-3 text-body text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            onClick={() => void confirmArchive()}
          >
            Archive
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setArchiveTarget(null)}
          >
            Cancel
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
