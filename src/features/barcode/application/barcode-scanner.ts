export type BarcodeScannerApi = {
  isSupported: () => boolean;
  requestCamera: () => Promise<MediaStream>;
  detect: (video: HTMLVideoElement) => Promise<string | null>;
  stop: (stream: MediaStream | null) => void;
};

type DetectorCtor = new (options?: { formats?: string[] }) => {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
};

function detectorCtor(): DetectorCtor | undefined {
  const candidate = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  return typeof candidate === "function" ? candidate : undefined;
}

export function isBarcodeDetectorSupported(): boolean {
  return detectorCtor() !== undefined;
}

export function stopMediaStream(stream: MediaStream | null): void {
  if (!stream) {
    return;
  }
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export function createBarcodeScanner(): BarcodeScannerApi {
  return {
    isSupported: isBarcodeDetectorSupported,
    async requestCamera() {
      if (!isBarcodeDetectorSupported()) {
        throw new Error("unsupported");
      }
      return navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
    },
    async detect(video) {
      const Detector = detectorCtor();
      if (!Detector) {
        return null;
      }
      const detector = new Detector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e"],
      });
      const codes = await detector.detect(video);
      const value = codes.find((code) => code.rawValue)?.rawValue?.trim();
      return value && value.length > 0 ? value : null;
    },
    stop: stopMediaStream,
  };
}
