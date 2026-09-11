/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ProductBarcodeFields,
  type ProductBarcodeFieldsApi,
} from "./product-barcode-fields";

afterEach(() => {
  cleanup();
});

function api(overrides: Partial<ProductBarcodeFieldsApi> = {}): ProductBarcodeFieldsApi {
  return {
    lookupProductByBarcode: vi.fn().mockResolvedValue({ ok: false, code: "not_found" }),
    isSupported: () => false,
    requestCamera: vi.fn(),
    detect: vi.fn(),
    stop: vi.fn(),
    ...overrides,
  };
}

function renderFields(
  control: ProductBarcodeFieldsApi,
  props?: { barcode?: string; name?: string },
) {
  const state = {
    barcode: props?.barcode ?? "",
    name: props?.name ?? "",
  };
  const fields = () => (
    <ProductBarcodeFields
      barcode={state.barcode}
      name={state.name}
      onBarcodeChange={onBarcodeChange}
      onNameChange={onNameChange}
      api={control}
    />
  );
  const onBarcodeChange = vi.fn((value: string) => {
    state.barcode = value;
    view.rerender(fields());
  });
  const onNameChange = vi.fn((value: string) => {
    state.name = value;
    view.rerender(fields());
  });
  const view = render(fields());
  return { ...view, onBarcodeChange, onNameChange, state };
}

describe("ProductBarcodeFields", () => {
  it("lets the user enter, edit, and clear a barcode without looking it up", () => {
    const control = api();
    const { onBarcodeChange } = renderFields(control);

    fireEvent.change(screen.getByLabelText("Barcode"), {
      target: { value: "5449000000996" },
    });
    expect(onBarcodeChange).toHaveBeenCalledWith("5449000000996");
    fireEvent.change(screen.getByLabelText("Barcode"), { target: { value: "" } });
    expect(onBarcodeChange).toHaveBeenLastCalledWith("");
    expect(control.lookupProductByBarcode).not.toHaveBeenCalled();
    expect(control.requestCamera).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Scan barcode" })).toBeTruthy();
  });

  it("prefills an empty name after a scan lookup and keeps a typed name", async () => {
    const lookupProductByBarcode = vi.fn().mockResolvedValue({
      ok: true,
      name: "Coca-Cola",
    });
    const { onBarcodeChange, onNameChange } = renderFields(
      api({
        isSupported: () => true,
        requestCamera: vi.fn().mockResolvedValue({ getTracks: () => [] }),
        detect: vi.fn().mockResolvedValue("5449000000996"),
        lookupProductByBarcode,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Scan barcode" }));
    expect(await screen.findByRole("dialog", { name: "Scan barcode" })).toBeTruthy();

    await waitFor(() => {
      expect(onBarcodeChange).toHaveBeenCalledWith("5449000000996");
      expect(lookupProductByBarcode).toHaveBeenCalledWith("5449000000996");
      expect(onNameChange).toHaveBeenCalledWith("Coca-Cola");
    });

    cleanup();
    const typed = api({
      isSupported: () => true,
      requestCamera: vi.fn().mockResolvedValue({ getTracks: () => [] }),
      detect: vi.fn().mockResolvedValue("5449000000996"),
      lookupProductByBarcode,
    });
    const next = renderFields(typed, { name: "My cola" });
    fireEvent.click(screen.getByRole("button", { name: "Scan barcode" }));
    await waitFor(() => {
      expect(typed.lookupProductByBarcode).toHaveBeenCalled();
    });
    expect(next.onNameChange).not.toHaveBeenCalled();
  });

  it("keeps the barcode when lookup finds nothing or fails", async () => {
    const lookupProductByBarcode = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, code: "not_found" });
    renderFields(
      api({
        isSupported: () => true,
        requestCamera: vi.fn().mockResolvedValue({ getTracks: () => [] }),
        detect: vi.fn().mockResolvedValue("5449000000996"),
        lookupProductByBarcode,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Scan barcode" }));
    expect(await screen.findByText("No product was found. Enter the details.")).toBeTruthy();
    expect(screen.getByLabelText("Barcode")).toBeTruthy();
  });
});
