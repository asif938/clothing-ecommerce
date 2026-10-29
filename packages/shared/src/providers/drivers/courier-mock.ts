import { z } from "zod";
import type { CourierDriver, ProviderDriverDefinition, ShipmentStatusValue } from "../types.ts";

/**
 * Simulates a courier's status progression on a timer (§10.2: "Mock —
 * simulates status progression on a timer, including partial delivery and
 * rejection"). No real network call, no real clock needed beyond
 * `Date.now()`: the consignment id itself encodes `bookedAt`, so
 * `getStatus()` is a pure function of elapsed time and needs no storage of
 * its own — the poll job (`ShipmentTrackingPollService`) just calls it
 * again each sweep and persists whatever it reports.
 *
 * Staff can create several mock courier *instances* in admin (one per
 * `finalStatus`) to exercise different outcomes side by side — e.g. "Mock
 * (delivered)" for the happy path and "Mock (rejected at door)" for the
 * M6 acceptance scenario — rather than this driver picking randomly.
 */
export const mockCourierConfigSchema = z.object({
  finalStatus: z
    .enum(["delivered", "partially_delivered", "rejected_at_door", "returned_to_sender", "cancelled", "lost"])
    .default("delivered"),
  stepMinutes: z.number().min(0.01).max(1440).default(2),
  deliveryFeeCollected: z.number().int().min(0).default(6000), // poisha — only used when finalStatus collects one at the door
});
export type MockCourierConfig = z.infer<typeof mockCourierConfigSchema>;

const PROGRESSION: ShipmentStatusValue[] = ["booked", "picked_up", "in_transit", "out_for_delivery"];
const DOOR_OUTCOMES = new Set<ShipmentStatusValue>(["rejected_at_door", "partially_delivered"]);

function encodeConsignmentId(bookedAtMs: number): string {
  return `mock_${bookedAtMs}_${Math.random().toString(36).slice(2, 8)}`;
}

function decodeBookedAt(consignmentId: string): number {
  const match = /^mock_(\d+)_/.exec(consignmentId);
  return match ? Number(match[1]) : Date.now();
}

export function createMockCourierDriver(config: MockCourierConfig): CourierDriver {
  return {
    async createParcel() {
      const bookedAtMs = Date.now();
      const consignmentId = encodeConsignmentId(bookedAtMs);
      return { consignmentId, trackingCode: consignmentId };
    },
    async getStatus(consignmentId) {
      const bookedAtMs = decodeBookedAt(consignmentId);
      const elapsedSteps = Math.floor((Date.now() - bookedAtMs) / (config.stepMinutes * 60_000));

      if (elapsedSteps < PROGRESSION.length) {
        const status = PROGRESSION[elapsedSteps]!;
        return { status, rawStatus: status };
      }

      const status = config.finalStatus;
      return {
        status,
        rawStatus: status,
        deliveryFeeCollected: DOOR_OUTCOMES.has(status) ? config.deliveryFeeCollected : undefined,
      };
    },
    async cancelParcel() {
      // Simulated — nothing to actually cancel.
    },
  };
}

export const mockCourierDriverDefinition: ProviderDriverDefinition<MockCourierConfig> = {
  capability: "courier",
  driver: "mock",
  label: { bn: "মক কুরিয়ার (পরীক্ষার জন্য)", en: "Mock courier (for testing)" },
  configSchema: mockCourierConfigSchema,
  secretFields: [],
  async testConnection(config) {
    return { ok: true, message: `Mock courier is configured to end at "${config.finalStatus}".` };
  },
};
