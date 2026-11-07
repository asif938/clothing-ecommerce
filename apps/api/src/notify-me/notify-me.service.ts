import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { CreateNotifyMeDto } from "./dto";

function titleToString(title: unknown): string {
  const localized = title as { bn?: string; en?: string } | null;
  return localized?.en ?? localized?.bn ?? "";
}

/**
 * "Notify me" for an out-of-stock variant (docs/PROJECT_SPEC.md §5.5,
 * §7.4) — no customer account required, just a contact to message once
 * restocked. Sending that message was a known M4 gap ("nothing actually
 * sends the back-in-stock message") closed in Milestone 10:
 * `InventoryService.adjust()` calls `fulfillForVariant()` the moment a
 * level's `available` crosses from 0 to positive.
 */
@Injectable()
export class NotifyMeService {
  private readonly logger = new Logger(NotifyMeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateNotifyMeDto) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: dto.variantId } });
    if (!variant) throw new NotFoundException("Variant not found");

    // No natural unique key spans (variant, contact) in the schema — a
    // plain lookup-then-create is simpler than a composite unique index
    // for a case this cheap to de-dupe, and resubmitting the same request
    // twice is harmless either way (both rows would just sit `pending`).
    const existing = await this.prisma.notifyMeRequest.findFirst({
      where: { variantId: dto.variantId, status: "pending", ...(dto.channel === "sms" ? { contactPhone: dto.contactPhone } : { contactEmail: dto.contactEmail }) },
    });
    if (existing) return existing;

    return await this.prisma.notifyMeRequest.create({
      data: { variantId: dto.variantId, contactPhone: dto.contactPhone ?? null, contactEmail: dto.contactEmail ?? null, channel: dto.channel },
    });
  }

  /** Called by `InventoryService.adjust()` on a 0→positive `available` crossing — never by a schedule, since there's no cheap way to know *which* variants changed without one. */
  async fulfillForVariant(variantId: string): Promise<void> {
    const requests = await this.prisma.notifyMeRequest.findMany({
      where: { variantId, status: "pending" },
      include: { variant: { include: { product: { select: { title: true, slug: true } } } } },
    });
    if (requests.length === 0) return;

    const commonVars = await this.notifications.commonVariables();
    const storefrontUrl = process.env.STOREFRONT_URL ?? "";
    for (const request of requests) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await this.notifications.enqueue(tx, {
            event: "back_in_stock",
            recipientType: "guest",
            recipientId: null,
            locale: "bn",
            contacts: { sms: request.contactPhone, whatsapp: request.contactPhone, email: request.contactEmail },
            variables: {
              ...commonVars,
              product_title: titleToString(request.variant.product.title),
              product_url: `${storefrontUrl}/p/${request.variant.product.slug}`,
            },
            related: { type: "notify_me_request", id: request.id },
          });
          await tx.notifyMeRequest.update({ where: { id: request.id }, data: { status: "notified" } });
        });
      } catch (error) {
        this.logger.error(`Failed to notify request ${request.id}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  }
}
