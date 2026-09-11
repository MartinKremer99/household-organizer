import { afterEach, describe, expect, it, vi } from "vitest";
import { createBarcodeScanner } from "./barcode-scanner";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("barcode scanner adapter", () => {
  it("is unsupported without BarcodeDetector and does not request the camera", async () => {
    vi.stubGlobal("BarcodeDetector", undefined);
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    const scanner = createBarcodeScanner();
    expect(scanner.isSupported()).toBe(false);
    await expect(scanner.requestCamera()).rejects.toThrow(/unsupported/i);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("requests the camera only when supported", async () => {
    const stream = { getTracks: () => [] };
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("BarcodeDetector", function BarcodeDetector() {});
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    const scanner = createBarcodeScanner();
    expect(scanner.isSupported()).toBe(true);
    await expect(scanner.requestCamera()).resolves.toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: "environment" },
    });
  });

  it("stops every media track", () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }, { stop }] };
    createBarcodeScanner().stop(stream as unknown as MediaStream);
    expect(stop).toHaveBeenCalledTimes(2);
    createBarcodeScanner().stop(null);
  });

  it("returns the first detected raw value", async () => {
    const detect = vi.fn().mockResolvedValue([{ rawValue: "5449000000996" }]);
    vi.stubGlobal(
      "BarcodeDetector",
      class {
        detect = detect;
      },
    );
    const scanner = createBarcodeScanner();
    await expect(
      scanner.detect({} as HTMLVideoElement),
    ).resolves.toBe("5449000000996");
    expect(detect).toHaveBeenCalledTimes(1);
  });
});
