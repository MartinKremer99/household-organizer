"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { catalogErrorMessage } from "@/features/catalog/ui/catalog-errors";
import {
  createBarcodeScanner,
  type BarcodeScannerApi,
} from "@/features/barcode/application/barcode-scanner";
import { lookupProductByBarcode } from "@/features/barcode/application/lookup-product-by-barcode";
import { validateBarcode } from "@/lib/domain/products/barcode";
import { BarcodeScanDialog } from "./barcode-scan-dialog";

export type ProductBarcodeFieldsApi = BarcodeScannerApi & {
  lookupProductByBarcode: typeof lookupProductByBarcode;
};

const scanner = createBarcodeScanner();

const defaults: ProductBarcodeFieldsApi = {
  ...scanner,
  lookupProductByBarcode,
};

export function ProductBarcodeFields({
  barcode,
  name,
  onBarcodeChange,
  onNameChange,
  api,
}: {
  barcode: string;
  name: string;
  onBarcodeChange: (value: string) => void;
  onNameChange: (value: string) => void;
  api?: Partial<ProductBarcodeFieldsApi>;
}) {
  const client = useMemo(() => ({ ...defaults, ...api }), [api]);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleDetected(raw: string) {
    setScanning(false);
    const parsed = validateBarcode(raw);
    if (!parsed.ok || !parsed.value) {
      setStatus(catalogErrorMessage("invalid_barcode"));
      return;
    }
    onBarcodeChange(parsed.value);
    setStatus("Looking up product…");
    const result = await client.lookupProductByBarcode(parsed.value);
    if (result.ok) {
      if (name.trim() === "") {
        onNameChange(result.name);
      }
      setStatus(null);
      return;
    }
    if (result.code === "not_found") {
      setStatus("No product was found. Enter the details.");
      return;
    }
    if (result.code === "offline") {
      setStatus("Lookup needs a connection.");
      return;
    }
    if (result.code === "invalid_barcode") {
      setStatus(catalogErrorMessage("invalid_barcode"));
      return;
    }
    setStatus("Could not look up that barcode.");
  }

  return (
    <div className="flex flex-col gap-3">
      <TextField
        id="product-barcode"
        label="Barcode"
        inputMode="numeric"
        autoComplete="off"
        value={barcode}
        onChange={(event) => {
          onBarcodeChange(event.target.value);
        }}
      />
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          setStatus(null);
          setScanning(true);
        }}
      >
        Scan barcode
      </Button>
      {status ? (
        <p
          role={status === "Looking up product…" ? "status" : "alert"}
          className={
            status === "Looking up product…"
              ? "text-secondary text-muted-foreground"
              : "text-body text-danger"
          }
        >
          {status}
        </p>
      ) : null}
      <BarcodeScanDialog
        open={scanning}
        onClose={() => {
          setScanning(false);
        }}
        onDetected={(value) => {
          void handleDetected(value);
        }}
        api={client}
      />
    </div>
  );
}
