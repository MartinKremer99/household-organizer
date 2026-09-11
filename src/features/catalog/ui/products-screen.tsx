"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  archiveProduct,
  changeProductCategory,
  changeProductMinimumStock,
  createProduct,
  listActiveProducts,
  renameProduct,
  searchActiveProducts,
} from "@/features/products/application/manage-products";
import { listActiveCategories } from "@/features/categories/application/manage-categories";
import { ProductBarcodeFields } from "@/features/barcode/ui/product-barcode-fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/text-field";
import { catalogErrorMessage } from "./catalog-errors";

export type ProductsScreenApi = {
  listActiveProducts: typeof listActiveProducts;
  searchActiveProducts: typeof searchActiveProducts;
  listActiveCategories: typeof listActiveCategories;
  createProduct: typeof createProduct;
  renameProduct: typeof renameProduct;
  changeProductCategory: typeof changeProductCategory;
  changeProductMinimumStock: typeof changeProductMinimumStock;
  archiveProduct: typeof archiveProduct;
};

type Product = Awaited<ReturnType<ProductsScreenApi["listActiveProducts"]>>[number];
type Category = Awaited<ReturnType<ProductsScreenApi["listActiveCategories"]>>[number];

const defaults: ProductsScreenApi = {
  listActiveProducts,
  searchActiveProducts,
  listActiveCategories,
  createProduct,
  renameProduct,
  changeProductCategory,
  changeProductMinimumStock,
  archiveProduct,
};

type Editor = {
  mode: "create" | "edit";
  product?: Product;
  name: string;
  categoryId: string;
  minimumStock: string;
  barcode: string;
};

export function ProductsScreen({
  householdId,
  api,
}: {
  householdId: string;
  api?: Partial<ProductsScreenApi>;
}) {
  const catalog = useMemo(() => ({ ...defaults, ...api }), [api]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null);
  const [pending, setPending] = useState(false);

  const categoryName = useCallback(
    (categoryId: string) =>
      categories.find((row) => row.id === categoryId)?.name ?? "Unknown category",
    [categories],
  );

  const reload = useCallback(async () => {
    const [nextProducts, nextCategories] = await Promise.all([
      query.trim()
        ? catalog.searchActiveProducts(householdId, query)
        : catalog.listActiveProducts(householdId),
      catalog.listActiveCategories(householdId),
    ]);
    setProducts(nextProducts);
    setCategories(nextCategories);
  }, [catalog, householdId, query]);

  useEffect(() => {
    let cancelled = false;
    const productsPromise = query.trim()
      ? catalog.searchActiveProducts(householdId, query)
      : catalog.listActiveProducts(householdId);
    void Promise.all([
      productsPromise,
      catalog.listActiveCategories(householdId),
    ]).then(([nextProducts, nextCategories]) => {
      if (cancelled) {
        return;
      }
      setProducts(nextProducts);
      setCategories(nextCategories);
    });
    return () => {
      cancelled = true;
    };
  }, [catalog, householdId, query]);

  async function handleSearchChange(value: string) {
    setQuery(value);
  }

  async function saveEditor() {
    if (!editor) {
      return;
    }

    setPending(true);
    setError(null);
    setStatus(null);

    if (editor.mode === "create") {
      const result = await catalog.createProduct({
        household_id: householdId,
        name: editor.name,
        category_id: editor.categoryId,
        minimum_stock: Number(editor.minimumStock),
        barcode: editor.barcode.trim() === "" ? null : editor.barcode,
      });
      setPending(false);
      if (!result.ok) {
        setError(catalogErrorMessage(result.code));
        return;
      }
      setEditor(null);
      setStatus("Saved.");
      await reload();
      return;
    }

    const product = editor.product;
    if (!product) {
      setPending(false);
      return;
    }

    const nextName = editor.name;
    const nextCategory = editor.categoryId;
    const nextMin = Number(editor.minimumStock);

    if (nextName.trim() !== product.name) {
      const renamed = await catalog.renameProduct({
        household_id: householdId,
        product_id: product.id,
        name: nextName,
      });
      if (!renamed.ok) {
        setPending(false);
        setError(catalogErrorMessage(renamed.code));
        return;
      }
    }

    if (nextCategory !== product.category_id) {
      const moved = await catalog.changeProductCategory({
        household_id: householdId,
        product_id: product.id,
        category_id: nextCategory,
      });
      if (!moved.ok) {
        setPending(false);
        setError(catalogErrorMessage(moved.code));
        return;
      }
    }

    if (nextMin !== product.minimum_stock) {
      const stocked = await catalog.changeProductMinimumStock({
        household_id: householdId,
        product_id: product.id,
        minimum_stock: nextMin,
      });
      if (!stocked.ok) {
        setPending(false);
        setError(catalogErrorMessage(stocked.code));
        return;
      }
    }

    setPending(false);
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
    const result = await catalog.archiveProduct({
      household_id: householdId,
      product_id: archiveTarget.id,
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

  const searching = query.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight">Products</h1>

      <TextField
        id="product-search"
        label="Search products"
        value={query}
        onChange={(event) => void handleSearchChange(event.target.value)}
      />

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          disabled={categories.length === 0}
          onClick={() => {
            setError(null);
            setEditor({
              mode: "create",
              name: "",
              categoryId: categories[0]?.id ?? "",
              minimumStock: "0",
              barcode: "",
            });
          }}
        >
          Add product
        </Button>
        {categories.length === 0 ? (
          <p className="text-sm text-foreground/70">Add a category first.</p>
        ) : null}
      </div>

      {status ? (
        <p role="status" className="text-sm">
          {status}
        </p>
      ) : null}
      {error && !editor && !archiveTarget ? (
        <p role="alert" className="text-sm">
          {error}
        </p>
      ) : null}

      {products.length === 0 ? (
        <p className="text-sm text-foreground/80">
          {searching ? "No products found." : "No products yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {products.map((product) => (
            <li key={product.id}>
              <Card title={product.name}>
                <p>{categoryName(product.category_id)}</p>
                <p>Min {product.minimum_stock}</p>
                {product.barcode ? <p>{product.barcode}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setError(null);
                      setEditor({
                        mode: "edit",
                        product,
                        name: product.name,
                        categoryId: product.category_id,
                        minimumStock: String(product.minimum_stock),
                        barcode: product.barcode ?? "",
                      });
                    }}
                  >
                    Edit {product.name}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setError(null);
                      setArchiveTarget(product);
                    }}
                  >
                    Archive {product.name}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={editor !== null}
        title={editor?.mode === "edit" ? "Edit product" : "Add product"}
        titleId="product-editor-title"
        onClose={() => setEditor(null)}
      >
        {editor ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void saveEditor();
            }}
          >
            <TextField
              id="product-name"
              label="Name"
              value={editor.name}
              onChange={(event) =>
                setEditor({ ...editor, name: event.target.value })
              }
            />
            {editor.mode === "create" ? (
              <ProductBarcodeFields
                barcode={editor.barcode}
                name={editor.name}
                onBarcodeChange={(barcode) => setEditor({ ...editor, barcode })}
                onNameChange={(name) => setEditor({ ...editor, name })}
              />
            ) : null}
            <div className="flex flex-col gap-1">
              <label htmlFor="product-category" className="text-sm font-medium">
                Category
              </label>
              <select
                id="product-category"
                className="min-h-11 rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                value={editor.categoryId}
                onChange={(event) =>
                  setEditor({ ...editor, categoryId: event.target.value })
                }
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <TextField
              id="product-minimum-stock"
              label="Minimum stock"
              type="number"
              step="1"
              value={editor.minimumStock}
              onChange={(event) =>
                setEditor({ ...editor, minimumStock: event.target.value })
              }
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
        titleId="product-archive-title"
        onClose={() => setArchiveTarget(null)}
      >
        {error ? (
          <p role="alert" className="mb-3 text-sm">
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
