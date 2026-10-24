import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import type { AuthenticatedStaff } from "../common/types";
import { computeRateFee, listMatchingRates, selectZone, type Destination } from "./shipping-calc";
import type { CreateZoneDto, CreateRateDto, UpdateZoneDto, UpdateRateDto } from "./dto";

export interface ShippingQuoteRate {
  rateId: string;
  name: unknown;
  fee: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
}

export interface ShippingQuote {
  zoneId: string;
  rates: ShippingQuoteRate[];
}

/** Shipping zones & rates editor + calculation (docs/PROJECT_SPEC.md §5.7, §6.4). */
@Injectable()
export class ShippingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  listZones() {
    return this.prisma.shippingZone.findMany({ include: { rates: { orderBy: { position: "asc" } } }, orderBy: [{ priority: "desc" }] });
  }

  async getZone(id: string) {
    const zone = await this.prisma.shippingZone.findUnique({ where: { id }, include: { rates: { orderBy: { position: "asc" } } } });
    if (!zone) throw new NotFoundException("Shipping zone not found");
    return zone;
  }

  async createZone(dto: CreateZoneDto, actor: AuthenticatedStaff) {
    const zone = await this.prisma.shippingZone.create({ data: dto });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "shipping_zone.create", entityType: "shipping_zone", entityId: zone.id, after: zone });
    return zone;
  }

  async updateZone(id: string, dto: UpdateZoneDto, actor: AuthenticatedStaff) {
    const before = await this.getZone(id);
    const zone = await this.prisma.shippingZone.update({ where: { id }, data: dto });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "shipping_zone.update", entityType: "shipping_zone", entityId: id, before, after: zone });
    return zone;
  }

  async deleteZone(id: string, actor: AuthenticatedStaff): Promise<void> {
    const before = await this.getZone(id);
    await this.prisma.shippingZone.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "shipping_zone.delete", entityType: "shipping_zone", entityId: id, before });
  }

  async createRate(zoneId: string, dto: CreateRateDto, actor: AuthenticatedStaff) {
    await this.getZone(zoneId);
    const rate = await this.prisma.shippingRate.create({ data: { ...dto, zoneId, name: dto.name as Prisma.InputJsonValue } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "shipping_rate.create", entityType: "shipping_rate", entityId: rate.id, after: rate });
    return rate;
  }

  async updateRate(id: string, dto: UpdateRateDto, actor: AuthenticatedStaff) {
    const before = await this.prisma.shippingRate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Shipping rate not found");
    const rate = await this.prisma.shippingRate.update({ where: { id }, data: { ...dto, ...(dto.name !== undefined ? { name: dto.name as Prisma.InputJsonValue } : {}) } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "shipping_rate.update", entityType: "shipping_rate", entityId: id, before, after: rate });
    return rate;
  }

  async deleteRate(id: string, actor: AuthenticatedStaff): Promise<void> {
    const before = await this.prisma.shippingRate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Shipping rate not found");
    await this.prisma.shippingRate.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "shipping_rate.delete", entityType: "shipping_rate", entityId: id, before });
  }

  /** §6.4 steps 1-4, 7 — every matching rate in the best-matching zone, for the checkout UI's rate picker. Reads zones/rates live on every call (no cache) so an admin fee change is reflected immediately (§16 M5 acceptance). */
  async quote(destination: Destination, weightGrams: number, subtotal: number): Promise<ShippingQuote | null> {
    const [zones, globalFreeThreshold] = await Promise.all([
      this.prisma.shippingZone.findMany({ where: { isActive: true }, include: { rates: true } }),
      this.settings.getValue<number | null>("shipping.freeDeliveryThreshold"),
    ]);
    const zone = selectZone(zones, destination);
    if (!zone) return null;

    const matching = listMatchingRates(zone.rates, subtotal);
    return {
      zoneId: zone.id,
      rates: matching.map((rate) => ({
        rateId: rate.id,
        name: rate.name,
        fee: computeRateFee(rate, weightGrams, subtotal, globalFreeThreshold),
        estimatedDaysMin: rate.estimatedDaysMin,
        estimatedDaysMax: rate.estimatedDaysMax,
      })),
    };
  }

  /**
   * Resolves a single fee for the cart pricing pipeline — `rateId` is the
   * shopper's selection, defaulting to the first matching rate (§6.4 step
   * 2: "ordered by position; default to the first"). Throws when no zone
   * matches and no fallback fee is configured (§6.4 step 5: "block
   * checkout with a message").
   */
  async calculateFee(destination: Destination, weightGrams: number, subtotal: number, rateId?: string | null): Promise<{ fee: number; zoneId: string; rateId: string; estimatedDaysMin: number; estimatedDaysMax: number }> {
    const quote = await this.quote(destination, weightGrams, subtotal);
    if (!quote || quote.rates.length === 0) {
      const fallbackFee = await this.settings.getValue<number | null>("shipping.fallbackFee");
      if (fallbackFee === null) {
        throw new BadRequestException({ code: "NO_SHIPPING_ZONE", message: "We don't currently deliver to this area." });
      }
      return { fee: fallbackFee, zoneId: "fallback", rateId: "fallback", estimatedDaysMin: 3, estimatedDaysMax: 7 };
    }

    const selected = quote.rates.find((r) => r.rateId === rateId) ?? quote.rates[0]!;
    return { fee: selected.fee, zoneId: quote.zoneId, rateId: selected.rateId, estimatedDaysMin: selected.estimatedDaysMin, estimatedDaysMax: selected.estimatedDaysMax };
  }
}
