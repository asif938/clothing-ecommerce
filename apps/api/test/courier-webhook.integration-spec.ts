import request from "supertest";
import { encrypt } from "@clothing/shared/crypto";
import { createStockLocation } from "@clothing/db/factories";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { createTestApp } from "./setup";
import type { PrismaService } from "../src/prisma/prisma.service";

/**
 * §12 "webhook signature verification" — M9 added an optional per-instance
 * `webhookSecret` to the three real courier drivers (courier-{pathao,
 * redx,steadfast}.ts) and a shared-secret check in
 * ShipmentsWebhookController. This exercises that check directly, not the
 * courier status-mapping logic around it (see that controller file's own
 * comment on why an unverified HMAC scheme wasn't invented instead).
 */
describe("Courier webhook secret verification", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  async function makeShipment(webhookSecret: string | undefined, status: "booked" | "delivered") {
    const location = await createStockLocation(prisma, { isDefault: false });
    const order = await prisma.order.create({
      data: {
        orderNumber: `TEST${Date.now()}${Math.floor(Math.random() * 1000)}`,
        subtotal: 100000,
        total: 100000,
        shippingAddress: { line1: "test" },
        billingContact: { name: "Test Buyer", phone: "01711111111" },
      },
    });
    const instance = await prisma.providerInstance.create({
      data: {
        capability: "courier",
        driver: "steadfast",
        name: "Test Steadfast",
        enabled: true,
        config: encrypt(JSON.stringify({ apiKey: "k", secretKey: "s", webhookSecret }), process.env.APP_ENCRYPTION_KEY!) as object,
      },
    });
    const shipment = await prisma.shipment.create({
      data: {
        orderId: order.id,
        locationId: location.id,
        courierDriver: "steadfast",
        courierProviderInstanceId: instance.id,
        consignmentId: `CONSIGN-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        status,
        weightGrams: 500,
      },
    });
    return shipment;
  }

  it("rejects a webhook call with no secret when one is configured", async () => {
    const shipment = await makeShipment("correct-secret", "booked");
    const res = await request(app.getHttpServer())
      .post("/api/v1/webhooks/couriers/steadfast")
      .send({ consignment_id: shipment.consignmentId, status: "pending" });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "INVALID_WEBHOOK_SECRET" });
  });

  it("rejects a webhook call with the wrong secret", async () => {
    const shipment = await makeShipment("correct-secret", "booked");
    const res = await request(app.getHttpServer())
      .post("/api/v1/webhooks/couriers/steadfast")
      .set("X-Webhook-Secret", "wrong-secret")
      .send({ consignment_id: shipment.consignmentId, status: "pending" });
    expect(res.status).toBe(403);
  });

  it("accepts a webhook call with the correct secret", async () => {
    // Already terminal ("delivered") so the service's own early-return keeps this a safe no-op beyond the secret check.
    const shipment = await makeShipment("correct-secret", "delivered");
    const res = await request(app.getHttpServer())
      .post("/api/v1/webhooks/couriers/steadfast")
      .set("X-Webhook-Secret", "correct-secret")
      .send({ consignment_id: shipment.consignmentId, status: "pending" });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
  });

  it("lets a webhook call through unauthenticated when no secret is configured (sandbox/dev default)", async () => {
    const shipment = await makeShipment(undefined, "delivered");
    const res = await request(app.getHttpServer())
      .post("/api/v1/webhooks/couriers/steadfast")
      .send({ consignment_id: shipment.consignmentId, status: "pending" });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
  });
});
