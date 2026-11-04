import { BadRequestException, Injectable } from "@nestjs/common";
import {
  createMockTrackingDriver,
  mockTrackingConfigSchema,
  createMetaCapiDriver,
  metaCapiConfigSchema,
  createGa4MpDriver,
  ga4MpConfigSchema,
  createTiktokEventsDriver,
  tiktokEventsConfigSchema,
  type TrackingDriver,
} from "@clothing/shared/providers";
import { PrismaService } from "../prisma/prisma.service";
import { ProviderRegistryService } from "../providers/provider-registry.service";

export interface ResolvedTrackingInstance {
  instanceId: string;
  driverName: string;
}

/**
 * Several tracking provider instances are routinely active side by side
 * (Meta + GA4 + TikTok all at once) — same "no single active one" shape as
 * `CourierProvidersService` (M6), not `ProviderRegistryService.findActiveInstance`'s
 * single-winner pattern.
 */
@Injectable()
export class TrackingDriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistryService,
  ) {}

  listActiveInstances(): Promise<ResolvedTrackingInstance[]> {
    return this.prisma.providerInstance
      .findMany({ where: { capability: "tracking", enabled: true } })
      .then((rows) => rows.map((r) => ({ instanceId: r.id, driverName: r.driver })));
  }

  async resolve(instanceId: string): Promise<TrackingDriver> {
    const instance = await this.prisma.providerInstance.findUnique({ where: { id: instanceId } });
    if (!instance || instance.capability !== "tracking") {
      throw new BadRequestException({ code: "TRACKING_PROVIDER_NOT_CONFIGURED", message: "That tracking provider isn't configured." });
    }
    const config = this.registry.decryptConfig(instance.config);
    switch (instance.driver) {
      case "meta_capi":
        return createMetaCapiDriver(metaCapiConfigSchema.parse(config));
      case "ga4_mp":
        return createGa4MpDriver(ga4MpConfigSchema.parse(config));
      case "tiktok_events":
        return createTiktokEventsDriver(tiktokEventsConfigSchema.parse(config));
      default:
        return createMockTrackingDriver(mockTrackingConfigSchema.parse(config));
    }
  }
}
