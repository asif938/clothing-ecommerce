import { z } from "zod";
import type { PaymentDriver, ProviderDriverDefinition } from "../types.ts";

export const mockPaymentConfigSchema = z.object({
  simulate: z.enum(["success", "failure", "pending"]).default("success"),
  delayMs: z.number().int().min(0).max(10_000).default(0),
});
export type MockPaymentConfig = z.infer<typeof mockPaymentConfigSchema>;

/** Used in dev/tests/demos (§10.1) — a hosted "fake gateway" page the storefront redirects to is built by the checkout flow itself, not this driver; this just decides what `verify()` reports. */
export function createMockPaymentDriver(config: MockPaymentConfig): PaymentDriver {
  return {
    async initiate(input) {
      if (config.delayMs > 0) await new Promise((r) => setTimeout(r, config.delayMs));
      const externalRef = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      // A real gateway's hosted page lives on its own domain; the mock's
      // stand-in is one API route (MockPayController) that carries the
      // real returnUrls through as query params so it can redirect back
      // to them once it's "processed" the fake payment.
      const query = new URLSearchParams({
        ref: externalRef,
        outcome: config.simulate,
        successUrl: input.returnUrls.success,
        failUrl: input.returnUrls.fail,
        cancelUrl: input.returnUrls.cancel,
      });
      return { externalRef, redirectUrl: `/api/v1/payments/mock/pay?${query.toString()}` };
    },
    async verify(externalRef) {
      if (config.simulate === "pending") return { status: "pending", externalRef };
      return { status: config.simulate === "success" ? "succeeded" : "failed", externalRef };
    },
  };
}

export const mockPaymentDriverDefinition: ProviderDriverDefinition<MockPaymentConfig> = {
  capability: "payment",
  driver: "mock",
  label: { bn: "মক গেটওয়ে (পরীক্ষার জন্য)", en: "Mock gateway (for testing)" },
  configSchema: mockPaymentConfigSchema,
  secretFields: [],
  async testConnection(config) {
    if (config.simulate === "failure") {
      return { ok: false, message: "Mock driver is configured to simulate failure." };
    }
    return { ok: true, message: `Mock driver is configured to simulate ${config.simulate}.` };
  },
};
