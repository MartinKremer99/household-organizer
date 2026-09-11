/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BarcodeScanDialog, type BarcodeScanDialogApi } from "./barcode-scan-dialog";

afterEach(() => {
  cleanup();
});

function api(overrides: Partial<BarcodeScanDialogApi> = {}): BarcodeScanDialogApi {
  return {
    isSupported: () => true,
    requestCamera: vi.fn().mockResolvedValue({ getTracks: () => [] }),
    detect: vi.fn().mockResolvedValue(null),
    stop: vi.fn(),
    ...overrides,
  };
}

describe("BarcodeScanDialog", () => {
  it("does not request the camera when closed", () => {
    const scanner = api();
    render(
      <BarcodeScanDialog
        open={false}
        onClose={vi.fn()}
        onDetected={vi.fn()}
        api={scanner}
      />,
    );
    expect(scanner.requestCamera).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Scan barcode" })).toBeNull();
  });

  it("shows unsupported without requesting the camera", () => {
    const scanner = api({ isSupported: () => false });
    render(
      <BarcodeScanDialog open onClose={vi.fn()} onDetected={vi.fn()} api={scanner} />,
    );
    expect(screen.getByText("This browser cannot scan barcodes.")).toBeTruthy();
    expect(scanner.requestCamera).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("requests the camera only after opening and stops on cancel", async () => {
    const stream = { getTracks: () => [] };
    const stop = vi.fn();
    const scanner = api({
      requestCamera: vi.fn().mockResolvedValue(stream),
      stop,
    });
    const onClose = vi.fn();
    render(
      <BarcodeScanDialog open onClose={onClose} onDetected={vi.fn()} api={scanner} />,
    );

    expect(screen.getByRole("dialog", { name: "Scan barcode" })).toBeTruthy();
    await waitFor(() => {
      expect(scanner.requestCamera).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(stop).toHaveBeenCalledWith(stream);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a permission error and leaves cancel available", async () => {
    const scanner = api({
      requestCamera: vi.fn().mockRejectedValue(new Error("denied")),
    });
    render(
      <BarcodeScanDialog open onClose={vi.fn()} onDetected={vi.fn()} api={scanner} />,
    );
    expect(await screen.findByText("Could not open the camera. Enter the barcode instead.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("detects once, stops the camera, and ignores a second value", async () => {
    const stream = { getTracks: () => [] };
    const stop = vi.fn();
    const detect = vi
      .fn()
      .mockResolvedValueOnce("5449000000996")
      .mockResolvedValueOnce("0000000000000");
    const onDetected = vi.fn();
    const onClose = vi.fn();
    render(
      <BarcodeScanDialog
        open
        onClose={onClose}
        onDetected={onDetected}
        api={api({
          requestCamera: vi.fn().mockResolvedValue(stream),
          detect,
          stop,
        })}
      />,
    );

    await waitFor(() => {
      expect(onDetected).toHaveBeenCalledWith("5449000000996");
    });
    expect(onDetected).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledWith(stream);
    expect(onClose).toHaveBeenCalled();
  });
});
