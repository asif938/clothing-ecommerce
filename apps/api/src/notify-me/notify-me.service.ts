import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateNotifyMeDto } from "./dto";

/**
 * "Notify me" for an out-of-stock variant (docs/PROJECT_SPEC.md §5.5,
 * §7.4) — no customer account required, just a contact to message once
 * restocked. Actually sending that message is a later milestone's job
 * (notification drivers, M7); this only records the request.
 */
@Injectable()
export class NotifyMeService {
  constructor(private readonly prisma: PrismaService) {}

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
}
