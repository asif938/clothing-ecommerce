"use client";

import { useEffect } from "react";
import { setCartReferral, trackAffiliateClick } from "../lib/cart-api";

/**
 * §16 M16 — a friend's `?ref=CODE` link or a partner's `?aff=CODE` link is
 * remembered on the shopper's cart (server-side, so it survives the visit
 * and login). Unknown or switched-off codes are silently ignored. Renders
 * nothing.
 */
export function RewardsCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref")?.trim();
    const aff = params.get("aff")?.trim();
    if (ref && ref.length <= 20) void setCartReferral(ref).catch(() => undefined);
    if (aff && aff.length <= 40) void trackAffiliateClick(aff).catch(() => undefined);
  }, []);
  return null;
}
