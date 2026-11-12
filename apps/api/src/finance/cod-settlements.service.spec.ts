import { describe, expect, it, vi } from "vitest";
import { CodSettlementsService } from "./cod-settlements.service";

const actor = { id: "staff-1", name: "A", email: "a@x", locale: "en", permissions: new Set<string>(), isSuperAdmin: false, totpEnabled: true };

function make(opts: { lines?: Record<string, unknown>[]; claim?: number; shipments?: Record<string, unknown>[]; shipmentUpdateCount?: number; driver?: Record<string, unknown> } = {}) {
  const tx = {
    codSettlement: { updateMany: vi.fn(() => Promise.resolve({ count: opts.claim ?? 1 })) },
    codSettlementLine: { findMany: vi.fn(() => Promise.resolve(opts.lines ?? [])), update: vi.fn(() => Promise.resolve({})) },
    shipment: { updateMany: vi.fn(() => Promise.resolve({ count: opts.shipmentUpdateCount ?? 1 })) },
  };
  const prisma = {
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    codSettlement: { findUnique: vi.fn(() => Promise.resolve({ id: "cs1", lines: [] })), create: vi.fn(() => Promise.resolve({ id: "cs1" })) },
    codSettlementLine: { findMany: vi.fn(() => Promise.resolve([])) },
    shipment: { findMany: vi.fn(() => Promise.resolve(opts.shipments ?? [])) },
    providerInstance: { findUnique: vi.fn(() => Promise.resolve(null)) },
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const settings = { getValue: vi.fn(() => Promise.resolve(100)) };
  const couriers = { resolveDriver: vi.fn(() => Promise.resolve({ driver: opts.driver ?? {}, driverName: "steadfast" })) };
  const service = new CodSettlementsService(prisma as never, audit as never, settings as never, couriers as never);
  return { service, tx, prisma, audit };
}

describe("CodSettlementsService.confirm", () => {
  it("posts clean and variance lines to their shipments, skipping unmatched/duplicate lines", async () => {
    const { service, tx } = make({
      lines: [
        { id: "l1", shipmentId: "s1", matched: true, flag: null, collected: 150_000, charge: 7_000 },
        { id: "l2", shipmentId: "s2", matched: true, flag: "variance", collected: 90_000, charge: 0 },
        { id: "l3", shipmentId: null, matched: false, flag: "unmatched", collected: 1_000, charge: 0 },
        { id: "l4", shipmentId: "s1", matched: true, flag: "duplicate", collected: 150_000, charge: 7_000 },
      ],
    });
    await service.confirm("cs1", { receivedAmount: 233_000 }, actor);
    expect(tx.shipment.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.shipment.updateMany).toHaveBeenCalledWith({ where: { id: "s1", codSettledAt: null }, data: { codSettledAt: expect.any(Date), codSettledAmount: 150_000, deliveryChargeActual: 7_000 } });
    expect(tx.shipment.updateMany).toHaveBeenCalledWith({ where: { id: "s2", codSettledAt: null }, data: { codSettledAt: expect.any(Date), codSettledAmount: 90_000 } });
  });

  it("flags a line whose shipment another settlement already posted", async () => {
    const { service, tx } = make({ lines: [{ id: "l1", shipmentId: "s1", matched: true, flag: null, collected: 1, charge: 0 }], shipmentUpdateCount: 0 });
    await service.confirm("cs1", {}, actor);
    expect(tx.codSettlementLine.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { flag: "already_settled" } });
  });

  it("can't confirm twice", async () => {
    const { service } = make({ claim: 0 });
    await expect(service.confirm("cs1", {}, actor)).rejects.toMatchObject({ response: { code: "SETTLEMENT_CONFIRMED" } });
  });
});

describe("CodSettlementsService.importFile", () => {
  it("parses the file, matches by consignment id and stores a draft with totals", async () => {
    const { service, prisma } = make({ shipments: [{ id: "s1", status: "delivered", codAmount: 100_000, deliveryFeeCollected: null, codSettledAt: null, consignmentId: "C1", trackingCode: "T1" }] });
    const csv = "Consignment,Amount,Charge\nC1,1000,70\nC9,500,60\n";
    await service.importFile(
      { fileName: "steadfast.csv", contentBase64: Buffer.from(csv).toString("base64"), courierDriver: "steadfast", mapping: { consignmentId: "Consignment", collected: "Amount", charge: "Charge" } },
      actor,
    );
    const data = (prisma.codSettlement.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> & { lines: { create: Record<string, unknown>[] } } }])[0].data;
    expect(data).toMatchObject({ source: "file", courierDriver: "steadfast", totalCollected: 150_000, totalCharges: 13_000, netAmount: 137_000 });
    expect(data.lines.create).toEqual([
      expect.objectContaining({ consignmentId: "C1", shipmentId: "s1", matched: true, flag: null, collected: 100_000 }),
      expect.objectContaining({ consignmentId: "C9", shipmentId: null, matched: false, flag: "unmatched" }),
    ]);
  });

  it("rejects unsupported file types", async () => {
    const { service } = make();
    await expect(service.importFile({ fileName: "x.pdf", contentBase64: "AA==", courierDriver: "manual", mapping: { consignmentId: "a", collected: "b" } }, actor)).rejects.toMatchObject({ response: { code: "UNSUPPORTED_FILE" } });
  });
});

describe("CodSettlementsService.fetchFromApi", () => {
  it("explains when the courier driver has no settlement API", async () => {
    const { service } = make({ driver: {} });
    await expect(service.fetchFromApi({ courierProviderInstanceId: "p1" }, actor)).rejects.toMatchObject({ response: { code: "NOT_SUPPORTED" } });
  });
});
