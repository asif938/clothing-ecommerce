import { createSign, privateDecrypt, publicEncrypt } from "node:crypto";
import { z } from "zod";
import type { PaymentDriver, ProviderDriverDefinition } from "../types.ts";

/**
 * Nagad (docs/PROJECT_SPEC.md §10.1): initialize (signed with the
 * merchant's private key, request payload encrypted with Nagad's public
 * key) → complete → redirect → callback → verify. Implemented against
 * Nagad's documented initialize/complete/verify flow and its RSA
 * sign+encrypt scheme; **re-verify against Nagad's current merchant
 * documentation before going live** — endpoint paths and payload shapes
 * are the part most likely to have moved since this was written, same
 * caveat as the bKash driver. Not verified against a live sandbox account
 * (no merchant keys exist yet, docs/DECISIONS.md).
 */
export const nagadConfigSchema = z.object({
  merchantId: z.string().min(1),
  merchantNumber: z.string().min(1),
  merchantPrivateKeyPem: z.string().min(1),
  nagadPublicKeyPem: z.string().min(1),
  sandbox: z.boolean().default(true),
});
export type NagadConfig = z.infer<typeof nagadConfigSchema>;

function baseUrl(config: NagadConfig): string {
  return config.sandbox ? "https://sandbox.mynagad.com/remote-payment-gateway-1.0" : "https://api.mynagad.com/remote-payment-gateway-1.0";
}

function sign(config: NagadConfig, payload: string): string {
  return createSign("SHA256").update(payload).sign(config.merchantPrivateKeyPem, "base64");
}

function encryptForNagad(config: NagadConfig, payload: string): string {
  return publicEncrypt(config.nagadPublicKeyPem, Buffer.from(payload)).toString("base64");
}

function decryptFromNagad(config: NagadConfig, base64: string): string {
  return privateDecrypt(config.merchantPrivateKeyPem, Buffer.from(base64, "base64")).toString("utf8");
}

export function createNagadDriver(config: NagadConfig): PaymentDriver {
  return {
    async initiate(input) {
      const dateTime = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
      const orderId = `${input.orderNumber}_${Date.now()}`;
      const initPayload = JSON.stringify({ merchantId: config.merchantId, datetime: dateTime, orderId, challenge: orderId });

      const initResponse = await fetch(`${baseUrl(config)}/api/dfs/check-out/initialize/${config.merchantId}/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-KM-Api-Version": "v-0.2.0", "X-KM-Client-Type": "PC_WEB" },
        body: JSON.stringify({ accountNumber: config.merchantNumber, dateTime, sensitiveData: encryptForNagad(config, initPayload), signature: sign(config, initPayload) }),
      });
      const initData = (await initResponse.json()) as { sensitiveData?: string; paymentReferenceId?: string; message?: string };
      if (!initData.paymentReferenceId) throw new Error(initData.message ?? "Nagad initialize failed");

      const completePayload = JSON.stringify({
        merchantId: config.merchantId,
        orderId,
        amount: (input.amount / 100).toFixed(2),
        currencyCode: "050",
        challenge: orderId,
      });
      const completeResponse = await fetch(`${baseUrl(config)}/api/dfs/check-out/complete/${initData.paymentReferenceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sensitiveData: encryptForNagad(config, completePayload), signature: sign(config, completePayload), merchantCallbackURL: input.returnUrls.success }),
      });
      const completeData = (await completeResponse.json()) as { callBackUrl?: string; message?: string };
      if (!completeData.callBackUrl) throw new Error(completeData.message ?? "Nagad complete failed");

      return { externalRef: initData.paymentReferenceId, redirectUrl: completeData.callBackUrl, raw: { initData, completeData } };
    },

    async verify(externalRef) {
      const response = await fetch(`${baseUrl(config)}/api/dfs/verify/payment/${externalRef}`, {
        headers: { "X-KM-Api-Version": "v-0.2.0" },
      });
      const data = (await response.json()) as { status?: string; sensitiveData?: string; amount?: string };
      const decrypted = data.sensitiveData ? (() => {
        try {
          return JSON.parse(decryptFromNagad(config, data.sensitiveData!)) as { amount?: string };
        } catch {
          return null;
        }
      })() : null;
      const succeeded = data.status === "Success";
      return {
        status: succeeded ? "succeeded" : data.status === "Pending" ? "pending" : "failed",
        externalRef,
        amount: decrypted?.amount ? Math.round(Number.parseFloat(decrypted.amount) * 100) : undefined,
        raw: data,
      };
    },
  };
}

export const nagadDriverDefinition: ProviderDriverDefinition<NagadConfig> = {
  capability: "payment",
  driver: "nagad",
  label: { bn: "নগদ", en: "Nagad" },
  configSchema: nagadConfigSchema,
  secretFields: ["merchantPrivateKeyPem"],
  async testConnection(config) {
    try {
      sign(config, "connection-test");
      return { ok: true, message: "Merchant private key signs successfully; endpoint reachability is only confirmed on a real initialize call." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Invalid merchant private key." };
    }
  },
};
