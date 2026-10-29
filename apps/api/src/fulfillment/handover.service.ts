import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";

/** §8.2 Fulfillment: "handover manifest per courier (list of parcels + signature sheet)". `handedOverAt` is bookkeeping for the printed manifest only — it never drives `Shipment.status`, which stays sourced from the courier itself (webhook/poll/staff update). */
@Injectable()
export class HandoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async manifestFor(courierProviderInstanceId: string | null) {
    const shipments = await this.prisma.shipment.findMany({
      where: { status: "booked", handedOverAt: null, courierProviderInstanceId },
      include: { order: { select: { orderNumber: true, shippingAddress: true, codAmount: true } } },
      orderBy: { bookedAt: "asc" },
    });
    const totalCod = shipments.reduce((sum, s) => sum + s.codAmount, 0);
    return { generatedAt: new Date().toISOString(), totalCod, shipments };
  }

  async markHandedOver(shipmentIds: string[], actor: AuthenticatedStaff) {
    const result = await this.prisma.shipment.updateMany({ where: { id: { in: shipmentIds }, status: "booked" }, data: { handedOverAt: new Date() } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "shipment.handed_over", entityType: "shipment", entityId: shipmentIds.join(","), after: { count: result.count } });
    return { count: result.count };
  }
}
