import { describe, expect, it, vi } from "vitest";
import { BomService } from "./bom.service";
import { MaterialsService } from "./materials.service";

const actor = { id: "staff-1", name: "A", email: "a@x", locale: "en", permissions: new Set<string>(), isSuperAdmin: false, totpEnabled: true };

function makeTx(onHand = 100) {
  let stock = onHand;
  return {
    material: {
      updateMany: vi.fn((args: { where: { onHand?: { gte: number } }; data: { onHand: { increment: number } } }) => {
        const need = args.where.onHand?.gte;
        if (need !== undefined && stock < need) return Promise.resolve({ count: 0 });
        stock += args.data.onHand.increment;
        return Promise.resolve({ count: 1 });
      }),
      findUnique: vi.fn(() => Promise.resolve({ onHand: stock })),
      findUniqueOrThrow: vi.fn(() => Promise.resolve({ onHand: stock })),
      findMany: vi.fn(),
    },
    materialMovement: { create: vi.fn(() => Promise.resolve({})) },
    productVariant: { findMany: vi.fn() },
    bomItem: { findMany: vi.fn() },
  };
}

function makeMaterials(tx = makeTx()) {
  const prisma = { $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)), material: { findUnique: vi.fn() } };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const settings = { getValue: vi.fn(() => Promise.resolve("weighted_average")) };
  return { service: new MaterialsService(prisma as never, audit as never, settings as never), tx, prisma, audit };
}

describe("MaterialsService.applyMovementTx", () => {
  it("adds stock and writes a ledger row with the balance after", async () => {
    const { service, tx } = makeMaterials(makeTx(100));
    const result = await service.applyMovementTx(tx as never, { materialId: "m1", delta: 50, reason: "purchase_receive", unitCost: 300, actor: "s" });
    expect(result.onHandAfter).toBe(150);
    expect(tx.materialMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ materialId: "m1", delta: 50, onHandAfter: 150, reason: "purchase_receive", unitCost: 300 }) });
  });

  it("refuses to take stock below zero and writes no ledger row", async () => {
    const { service, tx } = makeMaterials(makeTx(10));
    await expect(service.applyMovementTx(tx as never, { materialId: "m1", delta: -11, reason: "adjustment" })).rejects.toMatchObject({ response: { code: "MATERIAL_SHORTAGE", details: { onHand: 10, needed: 11 } } });
    expect(tx.materialMovement.create).not.toHaveBeenCalled();
  });

  it("allows taking exactly what is there", async () => {
    const { service, tx } = makeMaterials(makeTx(10));
    expect((await service.applyMovementTx(tx as never, { materialId: "m1", delta: -10, reason: "production_consume" })).onHandAfter).toBe(0);
  });

  it("rejects a zero movement", async () => {
    const { service, tx } = makeMaterials();
    await expect(service.applyMovementTx(tx as never, { materialId: "m1", delta: 0, reason: "adjustment" })).rejects.toMatchObject({ response: { code: "ZERO_MOVEMENT" } });
  });
});

describe("MaterialsService.receive", () => {
  it("blends the cost price by weighted average and books the stock", async () => {
    const tx = makeTx(100);
    tx.material.findUnique.mockResolvedValueOnce({ onHand: 100, costPrice: 300, isActive: true } as never);
    const { service, prisma } = makeMaterials(tx);
    prisma.material.findUnique.mockResolvedValue({ id: "m1", movements: [], bomItems: [] });
    (tx.material as unknown as { update: unknown }).update = vi.fn(() => Promise.resolve({}));
    await service.receive("m1", { quantity: 100, unitCost: 500 }, actor);
    // (100×300 + 100×500) / 200 = 400
    expect((tx.material as unknown as { update: ReturnType<typeof vi.fn> }).update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { costPrice: 400 } });
    expect(tx.materialMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ delta: 100, reason: "purchase_receive", unitCost: 500 }) });
  });
});

describe("BomService.consumeForProductionTx", () => {
  function makeBom(tx: ReturnType<typeof makeTx>, onHand: number) {
    tx.productVariant.findMany.mockResolvedValue([{ id: "v1", sku: "SHIRT-M", productId: "p1" }]);
    tx.bomItem.findMany.mockResolvedValue([{ productId: "p1", variantId: null, materialId: "fabric", quantity: 150, wastagePercent: 10 }]);
    tx.material.findMany.mockResolvedValue([{ id: "fabric", sku: "FAB", onHand }]);
    const materials = new MaterialsService({} as never, { record: vi.fn() } as never, {} as never);
    return new BomService({} as never, { record: vi.fn() } as never, materials);
  }
  const input = { lines: [{ variantId: "v1", quantity: 10 }], purchaseOrderId: "po1", purchaseOrderNumber: "PRD-1", allowShortage: false, actor: "s" };

  it("consumes quantity × units × wastage", async () => {
    const tx = makeTx(5000);
    const result = await makeBom(tx, 5000).consumeForProductionTx(tx as never, input);
    // 150 × 10 × 1.10 = 1650
    expect(result.consumed).toEqual([{ materialId: "fabric", quantity: 1650 }]);
    expect(tx.materialMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ delta: -1650, reason: "production_consume", referenceType: "purchase_order", referenceId: "po1" }) });
  });

  it("fails the receipt on a shortage and names the material", async () => {
    const tx = makeTx(1000);
    await expect(makeBom(tx, 1000).consumeForProductionTx(tx as never, input)).rejects.toMatchObject({ response: { code: "MATERIAL_SHORTAGE", details: { shortages: [expect.objectContaining({ materialId: "fabric", short: 650, sku: "FAB" })] } } });
    expect(tx.materialMovement.create).not.toHaveBeenCalled();
  });

  it("consumes what is available when a shortage is allowed", async () => {
    const tx = makeTx(1000);
    const result = await makeBom(tx, 1000).consumeForProductionTx(tx as never, { ...input, allowShortage: true });
    expect(result.consumed).toEqual([{ materialId: "fabric", quantity: 1000 }]);
    expect(result.shortages).toEqual([{ materialId: "fabric", short: 650 }]);
    expect(tx.materialMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ delta: -1000, note: "PRD-1 (short by 650)" }) });
  });

  it("reports variants with no BOM and consumes nothing for them", async () => {
    const tx = makeTx(1000);
    const bom = makeBom(tx, 1000);
    tx.bomItem.findMany.mockResolvedValue([]);
    const result = await bom.consumeForProductionTx(tx as never, input);
    expect(result).toEqual({ consumed: [], shortages: [], withoutBom: ["SHIRT-M"] });
  });
});
