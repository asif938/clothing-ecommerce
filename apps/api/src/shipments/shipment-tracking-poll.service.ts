import { Injectable, Logger } from "@nestjs/common";
import type { ShipmentStatus } from "@clothing/db";
import { SettingsService } from "../settings/settings.service";
import { PrismaService } from "../prisma/prisma.service";
import { CourierProvidersService } from "../couriers/courier-providers.service";
import { ShipmentsService } from "./shipments.service";

const ACTIVE_SHIPMENT_STATUSES: ShipmentStatus[] = ["booked", "picked_up", "in_transit", "out_for_delivery"];

/**
 * §10.2 "poll fallback job for providers without webhooks or when webhooks
 * are missing (every 2h for active shipments)". Manual shipments are never
 * polled (no driver to ask) — their status only changes when staff updates
 * it directly (`ShipmentsService.updateStatus`).
 */
@Injectable()
export class ShipmentTrackingPollService {
  private readonly logger = new Logger(ShipmentTrackingPollService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly couriers: CourierProvidersService,
    private readonly shipments: ShipmentsService,
  ) {}

  async runSweep(): Promise<{ checked: number }> {
    const intervalMinutes = await this.settings.getValue<number>("couriers.pollIntervalMinutes");
    const threshold = new Date(Date.now() - intervalMinutes * 60 * 1000);

    const due = await this.prisma.shipment.findMany({
      where: {
        manual: false,
        status: { in: ACTIVE_SHIPMENT_STATUSES },
        consignmentId: { not: null },
        OR: [{ lastPolledAt: null }, { lastPolledAt: { lte: threshold } }],
      },
      take: 100,
    });

    for (const shipment of due) {
      try {
        const { driver } = await this.couriers.resolveDriver(shipment.courierProviderInstanceId!);
        const result = await driver.getStatus(shipment.consignmentId!);
        await this.shipments.applyCourierResult(shipment.id, result);
      } catch (error) {
        this.logger.warn(`Poll failed for shipment ${shipment.id}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
    return { checked: due.length };
  }
}
