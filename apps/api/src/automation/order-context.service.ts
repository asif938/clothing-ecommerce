import { Injectable } from "@nestjs/common";
import { Module } from "@nestjs/common";
import type { Prisma } from "@clothing/db";
import type { ConditionContext } from "@clothing/shared/automation";
import { PrismaService } from "../prisma/prisma.service";
import { LocationsModule } from "../locations/locations.module";
import { LocationsService } from "../locations/locations.service";
import { buildAutomationContext } from "./automation-context";

export type OrderWithCustomer = Prisma.OrderGetPayload<{ include: { customer: true; _count: { select: { items: true } } } }>;

/** Loads an order and flattens it into the field map the shared condition evaluator reads - used by both automation rules and courier assignment rules so the two can never disagree about what "order.total" means. */
@Injectable()
export class OrderContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
  ) {}

  async forOrder(orderId: string): Promise<{ order: OrderWithCustomer; context: ConditionContext } | null> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { customer: true, _count: { select: { items: true } } } });
    if (!order) return null;
    const address = order.shippingAddress as { divisionId?: string; districtId?: string; areaId?: string } | null;
    const area = address?.areaId ? await this.locations.resolveArea(address.areaId) : null;
    const orderCount = order.customerId ? await this.prisma.order.count({ where: { customerId: order.customerId, status: { notIn: ["cancelled", "expired"] } } }) : 1;
    const context = buildAutomationContext(
      { ...order, shippingAddress: address, itemCount: order._count.items },
      order.customer ? { orderCount, rejectedAtDoorCount: order.customer.rejectedAtDoorCount, tags: order.customer.tags } : null,
      area?.isDhakaCity ?? false,
    );
    return { order, context };
  }
}

@Module({ imports: [LocationsModule], providers: [OrderContextService], exports: [OrderContextService] })
export class OrderContextModule {}
