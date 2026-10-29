import { describe, expect, it, vi } from "vitest";
import { createMockCourierDriver, mockCourierConfigSchema } from "./courier-mock.ts";

describe("createMockCourierDriver", () => {
  it("progresses through booked → picked_up → in_transit → out_for_delivery → delivered as time passes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const driver = createMockCourierDriver(mockCourierConfigSchema.parse({ finalStatus: "delivered", stepMinutes: 1 }));
    const { consignmentId } = await driver.createParcel();

    expect((await driver.getStatus(consignmentId)).status).toBe("booked");
    vi.advanceTimersByTime(60_000);
    expect((await driver.getStatus(consignmentId)).status).toBe("picked_up");
    vi.advanceTimersByTime(60_000);
    expect((await driver.getStatus(consignmentId)).status).toBe("in_transit");
    vi.advanceTimersByTime(60_000);
    expect((await driver.getStatus(consignmentId)).status).toBe("out_for_delivery");
    vi.advanceTimersByTime(60_000);
    expect((await driver.getStatus(consignmentId)).status).toBe("delivered");
    vi.useRealTimers();
  });

  it("ends at the configured finalStatus and reports a delivery fee collected for a door outcome", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const driver = createMockCourierDriver(mockCourierConfigSchema.parse({ finalStatus: "rejected_at_door", stepMinutes: 1, deliveryFeeCollected: 6000 }));
    const { consignmentId } = await driver.createParcel();

    vi.advanceTimersByTime(10 * 60_000);
    const result = await driver.getStatus(consignmentId);
    expect(result.status).toBe("rejected_at_door");
    expect(result.deliveryFeeCollected).toBe(6000);
    vi.useRealTimers();
  });

  it("does not report a delivery fee for a clean delivered outcome", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const driver = createMockCourierDriver(mockCourierConfigSchema.parse({ finalStatus: "delivered", stepMinutes: 1 }));
    const { consignmentId } = await driver.createParcel();

    vi.advanceTimersByTime(10 * 60_000);
    const result = await driver.getStatus(consignmentId);
    expect(result.status).toBe("delivered");
    expect(result.deliveryFeeCollected).toBeUndefined();
    vi.useRealTimers();
  });

  it("gives each booking a distinct consignment id", async () => {
    const driver = createMockCourierDriver(mockCourierConfigSchema.parse({}));
    const a = await driver.createParcel();
    const b = await driver.createParcel();
    expect(a.consignmentId).not.toBe(b.consignmentId);
  });
});
