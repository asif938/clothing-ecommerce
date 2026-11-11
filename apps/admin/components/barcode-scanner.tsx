"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "./ui";

/** Minimal typing for the (still non-standard, Chromium/Android) Shape Detection API - not in lib.dom yet. */
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

function detectorConstructor(): BarcodeDetectorConstructor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector ?? null;
}

const SCAN_INTERVAL_MS = 250;
/** Ignore the same code re-read within this window, so one held-up barcode counts once, not once per frame. */
const REPEAT_SUPPRESS_MS = 1500;

/**
 * Camera barcode scanner for warehouse flows (docs/PROJECT_SPEC.md §8.2 Admin
 * PWA, §16 M11). Uses the browser's built-in `BarcodeDetector` - no third
 * party scanning library to ship or vendor-lock to (golden rule 2's spirit),
 * and the physical USB/Bluetooth scanner path (a keyboard wedge typing into
 * the existing input) keeps working untouched. Where the API isn't available
 * (Safari, Firefox) the button explains that and the text input remains.
 */
export function BarcodeScanner({ onScan }: { onScan: (value: string) => void }) {
  const t = useTranslations("scanner");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRef = useRef<{ value: string; at: number } | null>(null);
  const onScanRef = useRef(onScan);
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!active) return;
    const Detector = detectorConstructor();
    if (!Detector) return;
    const detector = new Detector({ formats: ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "qr_code", "itf"] });
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        void video.play();
        timer = setInterval(() => {
          if (video.readyState < 2) return;
          detector
            .detect(video)
            .then((codes) => {
              const value = codes[0]?.rawValue;
              if (!value) return;
              const last = lastRef.current;
              const now = Date.now();
              if (last && last.value === value && now - last.at < REPEAT_SUPPRESS_MS) return;
              lastRef.current = { value, at: now };
              onScanRef.current(value);
            })
            .catch(() => undefined);
        }, SCAN_INTERVAL_MS);
      })
      .catch(() => {
        setMessage(t("cameraDenied"));
        setActive(false);
      });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [active, t]);

  function toggle() {
    setMessage(null);
    if (!active && !detectorConstructor()) {
      setMessage(t("unsupported"));
      return;
    }
    setActive((value) => !value);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="secondary" onClick={toggle}>
        {active ? t("stop") : t("start")}
      </Button>
      {message && <p className="text-xs text-warning">{message}</p>}
      {active && <video ref={videoRef} muted playsInline className="max-h-64 w-full max-w-sm rounded-theme border border-border bg-black" />}
    </div>
  );
}
