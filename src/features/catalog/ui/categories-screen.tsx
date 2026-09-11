"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  archiveCategory,
  createCategory,
  listActiveCategories,
  renameCategory,
} from "@/features/categories/application/manage-categories";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/text-field";
import { catalogErrorMessage } from "./catalog-errors";
import { CatalogRow } from "./catalog-row";

export type CategoriesScreenApi = {
  listActiveCategories: typeof listActiveCategories;
  createCategory: typeof createCategory;
  renameCategory: typeof renameCategory;
  archiveCategory: typeof archiveCategory;
};

type Category = Awaited<ReturnType<CategoriesScreenApi["listActiveCategories"]>>[number];

const defaults: CategoriesScreenApi = {
  listActiveCategories,
  createCategory,
  renameCategory,
  archiveCategory,
};

type Editor = {
  mode: "create" | "edit";
  category?: Category;
  name: string;
};

export function CategoriesScreen({
  householdId,
  api,
}: {
  householdId: string;
  api?: Partial<CategoriesScreenApi>;
}) {
  const catalog = useMemo(() => ({ ...defaults, ...api }), [api]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Category | null>(null);
  const [pending, setPending] = useState(false);

  const reload = useCallback(async () => {
    setCategories(await catalog.listActiveCategories(householdId));
  }, [catalog, householdId]);

  useEffect(() => {
    let cancelled = false;
    void catalog.listActiveCategories(householdId).then((next) => {
      if (cancelled) {
        return;
      }
      setCategories(next);
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
        ? await catalog.createCategory({
            household_id: householdId,
            name: editor.name,
          })
        : await catalog.renameCategory({
            household_id: householdId,
            category_id: editor.category?.id ?? "",
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
    const result = await catalog.archiveCategory({
      household_id: householdId,
      category_id: archiveTarget.id,
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
      <h1 className="text-pretty text-title font-semibold tracking-tight">Categories</h1>
      <Button
        type="button"
        variant={categories.length === 0 ? "primary" : "secondary"}
        onClick={() => {
          setError(null);
          setEditor({ mode: "create", name: "" });
        }}
      >
        Add category
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

      {categories.length === 0 ? (
        <p className="text-secondary text-muted-foreground">No categories yet.</p>
      ) : (
        <ul className="flex flex-col">
          {categories.map((category) => (
            <li key={category.id}>
              <CatalogRow name={category.name}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setError(null);
                    setEditor({
                      mode: "edit",
                      category,
                      name: category.name,
                    });
                  }}
                >
                  Rename {category.name}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    setError(null);
                    setArchiveTarget(category);
                  }}
                >
                  Archive {category.name}
                </Button>
              </CatalogRow>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={editor !== null}
        title={editor?.mode === "edit" ? "Rename category" : "Add category"}
        titleId="category-editor-title"
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
              id="category-name"
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
        titleId="category-archive-title"
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
