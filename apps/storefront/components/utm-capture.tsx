"use client";

import { useEffect } from "react";
import { captureUtm } from "../lib/utm";

/** Remembers the landing page's utm_* tags for checkout attribution (§16 M13). Renders nothing. */
export function UtmCapture() {
  useEffect(() => {
    captureUtm(window.location.search);
  }, []);
  return null;
}
