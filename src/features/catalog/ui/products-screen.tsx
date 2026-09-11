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
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { TextField } from "@/components/ui/text-field";
import { catalogErrorMessage } from "./catalog-errors";
import { CatalogRow } from "./catalog-row";

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
      <h1 className="text-pretty text-title font-semibold tracking-tight">Products</h1>

      <TextField
        id="product-search"
        label="Search products"
        value={query}
        onChange={(event) => void handleSearchChange(event.target.value)}
      />

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant={products.length === 0 ? "primary" : "secondary"}
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
          <p className="text-secondary text-muted-foreground">Add a category first.</p>
        ) : null}
      </div>

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

      {products.length === 0 ? (
        <p className="text-secondary text-muted-foreground">
          {searching ? "No products found." : "No products yet."}
        </p>
      ) : (
        <ul className="flex flex-col">
          {products.map((product) => (
            <li key={product.id}>
              <CatalogRow
                name={product.name}
                details={
                  <>
                    <p className="text-label text-muted-foreground">
                      {categoryName(product.category_id)}
                    </p>
                    <p className="text-label text-muted-foreground">
                      Min {product.minimum_stock}
                    </p>
                    {product.barcode ? (
                      <p className="font-mono text-label text-muted-foreground">
                        {product.barcode}
                      </p>
                    ) : null}
                  </>
                }
              >
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
                  variant="danger"
                  onClick={() => {
                    setError(null);
                    setArchiveTarget(product);
                  }}
                >
                  Archive {product.name}
                </Button>
              </CatalogRow>
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
            className="flex min-w-0 flex-col gap-3"
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
            <Select
              id="product-category"
              label="Category"
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
            </Select>
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
        titleId="product-archive-title"
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
