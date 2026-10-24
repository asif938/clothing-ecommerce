import { z } from "zod";
import type { PaymentDriver, PaymentVerifyResult, ProviderDriverDefinition } from "../types.ts";

/**
 * bKash Tokenized Checkout (docs/PROJECT_SPEC.md §10.1): grant a token →
 * create payment → redirect → callback → execute payment → query to
 * confirm. Implemented against bKash's documented Tokenized Checkout flow;
 * endpoint paths change between API versions, so **re-verify against
 * bKash's current merchant documentation before going live** (§10: "verify
 * endpoints, auth, and webhook signatures" at implementation time) — not
 * verified against a live sandbox account in this environment, since no
 * merchant credentials exist yet (docs/DECISIONS.md).
 *
 * Token caching ("Grant token, cached, refreshed" per §10.1) is not
 * implemented — each `initiate()` grants a fresh token. Correct, just not
 * the most efficient; worth adding once this is under real traffic.
 */
export const bkashConfigSchema = z.object({
  appKey: z.string().min(1),
  appSecret: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  sandbox: z.boolean().default(true),
});
export type BkashConfig = z.infer<typeof bkashConfigSchema>;

function baseUrl(config: BkashConfig): string {
  return config.sandbox ? "https://tokenized.sandbox.bka.sh/v1.2.0-beta" : "https://tokenized.pay.bka.sh/v1.2.0-beta";
}

async function grantToken(config: BkashConfig): Promise<string> {
  const response = await fetch(`${baseUrl(config)}/tokenized/checkout/token/grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", username: config.username, password: config.password },
    body: JSON.stringify({ app_key: config.appKey, app_secret: config.appSecret }),
  });
  const data = (await response.json()) as { id_token?: string; statusMessage?: string };
  if (!data.id_token) throw new Error(data.statusMessage ?? "bKash token grant failed");
  return data.id_token;
}

function authHeaders(config: BkashConfig, idToken: string): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: idToken, "X-App-Key": config.appKey };
}

export function createBkashDriver(config: BkashConfig): PaymentDriver {
  return {
    async initiate(input) {
      const idToken = await grantToken(config);
      const response = await fetch(`${baseUrl(config)}/tokenized/checkout/create`, {
        method: "POST",
        headers: authHeaders(config, idToken),
        body: JSON.stringify({
          mode: "0011",
          payerReference: input.customerPhone ?? input.orderNumber,
          callbackURL: input.returnUrls.success,
          amount: (input.amount / 100).toFixed(2),
          currency: input.currency,
          intent: "sale",
          merchantInvoiceNumber: input.orderNumber,
        }),
      });
      const data = (await response.json()) as { paymentID?: string; bkashURL?: string; statusMessage?: string };
      if (!data.paymentID || !data.bkashURL) throw new Error(data.statusMessage ?? "bKash payment creation failed");
      return { externalRef: data.paymentID, redirectUrl: data.bkashURL, raw: data };
    },

    async verify(externalRef): Promise<PaymentVerifyResult> {
      const idToken = await grantToken(config);
      // Execute is idempotent on bKash's side for an already-executed paymentID (§10.1) — a second
      // call reports the existing status instead of erroring, which is exactly what we want here.
      const executeResponse = await fetch(`${baseUrl(config)}/tokenized/checkout/execute`, {
        method: "POST",
        headers: authHeaders(config, idToken),
        body: JSON.stringify({ paymentID: externalRef }),
      });
      const executed = (await executeResponse.json()) as { transactionStatus?: string; trxID?: string; amount?: string };
      if (executed.transactionStatus === "Completed") {
        return { status: "succeeded", externalRef, amount: executed.amount ? Math.round(Number.parseFloat(executed.amount) * 100) : undefined, raw: executed };
      }

      const statusResponse = await fetch(`${baseUrl(config)}/tokenized/checkout/payment/status`, {
        method: "POST",
        headers: authHeaders(config, idToken),
        body: JSON.stringify({ paymentID: externalRef }),
      });
      const queried = (await statusResponse.json()) as { transactionStatus?: string; amount?: string };
      if (queried.transactionStatus === "Completed") {
        return { status: "succeeded", externalRef, amount: queried.amount ? Math.round(Number.parseFloat(queried.amount) * 100) : undefined, raw: queried };
      }
      return { status: queried.transactionStatus === "Initiated" ? "pending" : "failed", externalRef, raw: queried };
    },
  };
}

export const bkashDriverDefinition: ProviderDriverDefinition<BkashConfig> = {
  capability: "payment",
  driver: "bkash",
  label: { bn: "বিকাশ", en: "bKash" },
  configSchema: bkashConfigSchema,
  secretFields: ["appSecret", "password"],
  async testConnection(config) {
    try {
      await grantToken(config);
      return { ok: true, message: "bKash token grant succeeded." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Could not grant a bKash token." };
    }
  },
};
