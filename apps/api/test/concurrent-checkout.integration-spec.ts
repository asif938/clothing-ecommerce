import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { createProductWithVariant } from "@clothing/db/factories";
import { createTestApp } from "./setup";
import type { PrismaService } from "../src/prisma/prisma.service";

/**
 * §16 M5's acceptance line, never actually run end-to-end before now (no
 * live Postgres in the implementation sandbox — see docs/PROGRESS.md):
 * "Two buyers race for the last unit: exactly one order succeeds."
 *
 * Requires `pnpm db:migrate:deploy && pnpm db:seed` against a real
 * Postgres first (CI's `integration-tests` job does this) — the BD
 * locations tree and the default stock location both come from the base
 * seed, not from a factory, since re-seeding the whole location tree per
 * test file would be slow and this spec doesn't need its own copy of it.
 */
describe("Concurrent checkout: last-unit race", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it("lets exactly one of two simultaneous buyers check out the last unit", async () => {
    const location = await prisma.stockLocation.findFirst({ where: { isDefault: true, isActive: true } });
    expect(location, 'No default stock location — run "pnpm db:seed" against this DATABASE_URL first').toBeTruthy();

    const division = await prisma.division.findUnique({ where: { code: "DHA" } });
    const district = await prisma.district.findUnique({ where: { code: "DHA-DHAKA" } });
    const area = await prisma.area.findFirst({ where: { districtId: district?.id, isDhakaCity: true } });
    expect(division && district && area, 'BD locations not seeded — run "pnpm db:seed" against this DATABASE_URL first').toBeTruthy();

    const { variant } = await createProductWithVariant(prisma, location!.id, { onHand: 1 });

    const server = app.getHttpServer();
    const buyerA = request.agent(server);
    const buyerB = request.agent(server);

    for (const [buyer, phone] of [
      [buyerA, "01711111111"],
      [buyerB, "01722222222"],
    ] as const) {
      await buyer.get("/api/v1/store/cart");
      await buyer.post("/api/v1/store/cart/items").send({ variantId: variant.id, quantity: 1 }).expect(201);
      await buyer
        .patch("/api/v1/store/cart/address")
        .send({
          divisionId: division!.id,
          districtId: district!.id,
          areaId: area!.id,
          addressLine: "123 Test Road",
          contactName: "Test Buyer",
          contactPhone: phone,
        })
        .expect(200);
    }

    const placeOrder = (buyer: typeof buyerA) =>
      buyer
        .post("/api/v1/store/checkout/place-order")
        .set("Idempotency-Key", randomUUID())
        .send({ paymentMethod: "cod", termsAccepted: true });

    const [resultA, resultB] = await Promise.all([placeOrder(buyerA), placeOrder(buyerB)]);
    const statuses = [resultA.status, resultB.status].sort();

    // Exactly one succeeds; the other is refused for being out of stock, not for some unrelated reason.
    expect(statuses[0]).toBeLessThan(300);
    expect(statuses[1]).toBeGreaterThanOrEqual(400);
    const loser = resultA.status >= 400 ? resultA : resultB;
    expect(loser.body).toMatchObject({ code: "OUT_OF_STOCK" });

    const remaining = await prisma.inventoryLevel.findFirst({ where: { variantId: variant.id, locationId: location!.id } });
    expect(remaining?.reserved).toBe(1);
  });
});
