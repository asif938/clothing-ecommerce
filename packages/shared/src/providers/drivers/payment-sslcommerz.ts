import { z } from "zod";
import type { PaymentDriver, ProviderDriverDefinition } from "../types.ts";

/**
 * SSLCommerz (docs/PROJECT_SPEC.md §10.1): create a session → redirect to
 * the hosted `GatewayPageURL` → IPN/success/fail/cancel redirects →
 * **validate via the validation API before marking paid** (never trust the
 * redirect/IPN body alone). Implemented against SSLCommerz's documented v4
 * session + validator APIs; not verified against a live sandbox account in
 * this environment (§10: "no merchant accounts exist yet" — see
 * docs/DECISIONS.md).
 */
export const sslcommerzConfigSchema = z.object({
  storeId: z.string().min(1),
  storePassword: z.string().min(1),
  sandbox: z.boolean().default(true),
});
export type SslcommerzConfig = z.infer<typeof sslcommerzConfigSchema>;

function baseUrl(config: SslcommerzConfig): string {
  return config.sandbox ? "https://sandbox.sslcommerz.com" : "https://securepay.sslcommerz.com";
}

export function createSslcommerzDriver(config: SslcommerzConfig): PaymentDriver {
  return {
    async initiate(input) {
      const tranId = `${input.orderNumber}_${Date.now()}`;
      const body = new URLSearchParams({
        store_id: config.storeId,
        store_passwd: config.storePassword,
        total_amount: (input.amount / 100).toFixed(2),
        currency: input.currency,
        tran_id: tranId,
        success_url: input.returnUrls.success,
        fail_url: input.returnUrls.fail,
        cancel_url: input.returnUrls.cancel,
        cus_name: input.customerName ?? "Customer",
        cus_phone: input.customerPhone ?? "N/A",
        cus_email: input.customerEmail ?? "no-reply@example.com",
        cus_add1: "N/A",
        cus_city: "Dhaka",
        cus_country: "Bangladesh",
        shipping_method: "NO",
        product_name: `Order ${input.orderNumber}`,
        product_category: "General",
        product_profile: "general",
      });
      const response = await fetch(`${baseUrl(config)}/gwprocess/v4/api.php`, { method: "POST", body });
      const data = (await response.json()) as { status?: string; GatewayPageURL?: string; failedreason?: string };
      if (data.status !== "SUCCESS" || !data.GatewayPageURL) {
        throw new Error(data.failedreason ?? "SSLCommerz session creation failed");
      }
      return { externalRef: tranId, redirectUrl: data.GatewayPageURL, raw: data };
    },

    async verify(externalRef, callbackPayload) {
      const valId = callbackPayload?.val_id as string | undefined;
      if (!valId) return { status: "pending", externalRef };
      const params = new URLSearchParams({
        val_id: valId,
        store_id: config.storeId,
        store_passwd: config.storePassword,
        format: "json",
      });
      const response = await fetch(`${baseUrl(config)}/validator/api/validationserverAPI.php?${params.toString()}`);
      const data = (await response.json()) as { status?: string; amount?: string; tran_id?: string };
      const valid = data.status === "VALID" || data.status === "VALIDATED";
      return {
        status: valid ? "succeeded" : "failed",
        externalRef: data.tran_id ?? externalRef,
        amount: data.amount ? Math.round(Number.parseFloat(data.amount) * 100) : undefined,
        raw: data,
      };
    },
  };
}

export const sslcommerzDriverDefinition: ProviderDriverDefinition<SslcommerzConfig> = {
  capability: "payment",
  driver: "sslcommerz",
  label: { bn: "এসএসএলকমার্জ", en: "SSLCommerz" },
  configSchema: sslcommerzConfigSchema,
  secretFields: ["storePassword"],
  async testConnection(config) {
    try {
      const params = new URLSearchParams({ val_id: "test", store_id: config.storeId, store_passwd: config.storePassword, format: "json" });
      const response = await fetch(`${baseUrl(config)}/validator/api/validationserverAPI.php?${params.toString()}`);
      return { ok: response.ok, message: response.ok ? "Reached the SSLCommerz validator API." : `SSLCommerz responded with ${response.status}.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Could not reach SSLCommerz." };
    }
  },
};
