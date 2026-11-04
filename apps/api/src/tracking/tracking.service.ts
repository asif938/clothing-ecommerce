import { Injectable } from "@nestjs/common";
import { Prisma } from "@clothing/db";
import type { TrackingEventInput } from "@clothing/shared/providers";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingDriversService } from "./tracking-drivers.service";

export interface RecordPurchaseInput {
  eventId: string;
  orderId: string;
  /** Poisha (golden rule 3) — converted to taka here, once, at the one boundary these external APIs need plain currency units. */
  total: number;
  currency: string;
  items: { variantId: string; quantity: number; unitPrice: number }[];
  userData: { phone?: string | null; email?: string | null; clientIp?: string | null; userAgent?: string | null; fbc?: string | null; fbp?: string | null };
  sourceUrl?: string | null;
}

/**
 * Server-side tracking dispatch (docs/PROJECT_SPEC.md §13.3: "server-side
 * events via queue (never block checkout on tracking)"). `recordPurchase`
 * only ever writes `tracking_event_logs` rows — the actual network calls
 * happen later, in `TrackingDispatchService`'s sweep, exactly like M7's
 * notification pipeline split enqueue from send. One row per *active*
 * tracking provider instance, so Meta + GA4 + TikTok (if all three are
 * configured) each get their own independent delivery attempt and retry
 * count for the same logical event.
 */
@Injectable()
export class TrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drivers: TrackingDriversService,
  ) {}

  async recordPurchase(input: RecordPurchaseInput): Promise<void> {
    const active = await this.drivers.listActiveInstances();
    if (active.length === 0) return;

    const payload: TrackingEventInput = {
      eventName: "Purchase",
      eventId: input.eventId,
      eventTimeUnixSeconds: Math.floor(Date.now() / 1000),
      value: input.total / 100,
      currency: input.currency,
      contents: input.items.map((i) => ({ id: i.variantId, quantity: i.quantity, price: i.unitPrice / 100 })),
      userData: {
        phone: input.userData.phone ?? undefined,
        email: input.userData.email ?? undefined,
        clientIp: input.userData.clientIp ?? undefined,
        userAgent: input.userData.userAgent ?? undefined,
        fbc: input.userData.fbc ?? undefined,
        fbp: input.userData.fbp ?? undefined,
      },
      sourceUrl: input.sourceUrl ?? undefined,
    };

    await this.prisma.trackingEventLog.createMany({
      data: active.map((a) => ({
        eventId: input.eventId,
        eventName: "Purchase",
        driver: a.driverName,
        providerInstanceId: a.instanceId,
        status: "queued",
        payload: payload as unknown as Prisma.InputJsonValue,
        relatedEntityType: "order",
        relatedEntityId: input.orderId,
      })),
    });
  }
}
