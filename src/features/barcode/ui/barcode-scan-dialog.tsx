"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  createBarcodeScanner,
  type BarcodeScannerApi,
} from "@/features/barcode/application/barcode-scanner";

export type BarcodeScanDialogApi = BarcodeScannerApi;

const defaults: BarcodeScanDialogApi = createBarcodeScanner();

export function BarcodeScanDialog({
  open,
  onClose,
  onDetected,
  api,
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void;
  api?: Partial<BarcodeScanDialogApi>;
}) {
  const client = useMemo(() => ({ ...defaults, ...api }), [api]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onCloseRef = useRef(onClose);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState<string | null>(null);
  const supported = client.isSupported();

  useEffect(() => {
    onCloseRef.current = onClose;
    onDetectedRef.current = onDetected;
  }, [onClose, onDetected]);

  function closeScanner() {
    client.stop(streamRef.current);
    streamRef.current = null;
    setError(null);
    onCloseRef.current();
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!client.isSupported()) {
      return;
    }

    let cancelled = false;
    let detected = false;
    let frame = 0;

    async function start() {
      try {
        const stream = await client.requestCamera();
        streamRef.current = stream;
        if (cancelled) {
          client.stop(stream);
          streamRef.current = null;
          return;
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
        }

        const tick = async () => {
          if (cancelled || detected || !videoRef.current) {
            return;
          }
          const value = await client.detect(videoRef.current);
          if (cancelled || detected) {
            return;
          }
          if (value) {
            detected = true;
            client.stop(streamRef.current);
            streamRef.current = null;
            onDetectedRef.current(value);
            onCloseRef.current();
            return;
          }
          frame = requestAnimationFrame(() => {
            void tick();
          });
        };
        frame = requestAnimationFrame(() => {
          void tick();
        });
      } catch {
        if (!cancelled) {
          setError("Could not open the camera. Enter the barcode instead.");
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      client.stop(streamRef.current);
      streamRef.current = null;
    };
  }, [open, client]);

  return (
    <Dialog
      open={open}
      title="Scan barcode"
      titleId="barcode-scan-title"
      onClose={closeScanner}
    >
      <div className="flex flex-col gap-3">
        {supported ? (
          <video
            ref={videoRef}
            aria-label="Barcode camera preview"
            className="h-48 w-full rounded-md bg-foreground/10 object-cover"
            muted
            playsInline
            autoPlay
          />
        ) : (
          <p role="alert" className="text-body text-danger">
            This browser cannot scan barcodes.
          </p>
        )}
        {error ? (
          <p role="alert" className="text-body text-danger">
            {error}
          </p>
        ) : null}
        <Button type="button" variant="secondary" onClick={closeScanner}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}
