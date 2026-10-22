import { describe, expect, it, vi } from "vitest";
import { InventoryService } from "./inventory.service";
import type { AuthenticatedStaff } from "../common/types";

const actor: AuthenticatedStaff = { id: "staff-1", name: "A", email: "a@test.dev", locale: "en", permissions: new Set(), isSuperAdmin: false };

function makeService(level: { id: string; onHand: number; locationId: string; variantId: string }) {
  const prisma = {
    stockLocation: { findMany: vi.fn(() => Promise.resolve([{ id: "loc-1" }])) },
    inventoryLevel: {
      upsert: vi.fn(),
      findUnique: vi.fn(() => Promise.resolve(level)),
      update: vi.fn(({ data }: { data: { onHand: { increment: number } } }) =>
        Promise.resolve({ ...level, onHand: level.onHand + data.onHand.increment }),
      ),
    },
    stockMovement: { create: vi.fn((args: { data: unknown }) => Promise.resolve({ id: "mv-1", ...args.data as object })) },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const audit = { record: vi.fn() };
  const service = new InventoryService(prisma as never, audit as never);
  return { service, prisma, audit };
}

describe("InventoryService.ensureLevelsForVariant", () => {
  it("creates a zeroed level at every active location, idempotently", async () => {
    const { service, prisma } = makeService({ id: "lvl-1", onHand: 0, locationId: "loc-1", variantId: "v-1" });
    await service.ensureLevelsForVariant("v-1");
    expect(prisma.inventoryLevel.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { variantId_locationId: { variantId: "v-1", locationId: "loc-1" } }, create: { variantId: "v-1", locationId: "loc-1" } }),
    );
  });
});

describe("InventoryService.adjust", () => {
  it("increases on-hand and records a stock movement", async () => {
    const { service, prisma } = makeService({ id: "lvl-1", onHand: 10, locationId: "loc-1", variantId: "v-1" });
    const result = await service.adjust({ variantId: "v-1", locationId: "loc-1", quantityDelta: 5, reason: "purchase_receive" }, actor);
    expect(result.level.onHand).toBe(15);
    expect(prisma.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ quantity: 5, reason: "purchase_receive" }) }));
  });

  it("rejects a decrease that would take on-hand below zero", async () => {
    const { service } = makeService({ id: "lvl-1", onHand: 3, locationId: "loc-1", variantId: "v-1" });
    await expect(service.adjust({ variantId: "v-1", locationId: "loc-1", quantityDelta: -5, reason: "damage" }, actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "INSUFFICIENT_STOCK" }),
    });
  });

  it("allows a decrease that lands exactly at zero", async () => {
    const { service } = makeService({ id: "lvl-1", onHand: 5, locationId: "loc-1", variantId: "v-1" });
    const result = await service.adjust({ variantId: "v-1", locationId: "loc-1", quantityDelta: -5, reason: "sale" }, actor);
    expect(result.level.onHand).toBe(0);
  });
});
