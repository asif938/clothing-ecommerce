import { BadRequestException, Injectable } from "@nestjs/common";
import {
  createMockCourierDriver,
  createPathaoDriver,
  createRedxDriver,
  createSteadfastDriver,
  mockCourierConfigSchema,
  pathaoConfigSchema,
  redxConfigSchema,
  steadfastConfigSchema,
  type CourierDriver,
} from "@clothing/shared/providers";
import { PrismaService } from "../prisma/prisma.service";
import { ProviderRegistryService } from "../providers/provider-registry.service";

export interface CourierOption {
  /** `null` for the built-in "manual" option, which has no provider instance and no driver — §10.2 "Staff enters courier name + tracking code; status updated manually." */
  instanceId: string | null;
  driver: string;
  label: string;
}

/**
 * Unlike payment/sms/captcha/fraud_check, several courier provider
 * instances are routinely active side by side (§10.2 lists five drivers a
 * brand might use together) — there is no single "the active one" to
 * resolve, so this doesn't use `ProviderRegistryService.findActiveInstance`.
 * Staff pick which configured courier to book a given shipment with.
 */
@Injectable()
export class CourierProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistryService,
  ) {}

  async listAvailable(): Promise<CourierOption[]> {
    const instances = await this.prisma.providerInstance.findMany({ where: { capability: "courier", enabled: true }, orderBy: { priority: "desc" } });
    return [{ instanceId: null, driver: "manual", label: "Manual" }, ...instances.map((i) => ({ instanceId: i.id, driver: i.driver, label: i.driver }))];
  }

  /** `instanceId: null` means "manual" — no real driver, caller handles it directly (no `createParcel`/`getStatus` call makes sense for it). */
  async resolveDriver(instanceId: string): Promise<{ driver: CourierDriver; driverName: string }> {
    const instance = await this.prisma.providerInstance.findUnique({ where: { id: instanceId } });
    if (!instance || instance.capability !== "courier") throw new BadRequestException({ code: "COURIER_NOT_CONFIGURED", message: "That courier isn't configured." });
    const config = this.registry.decryptConfig(instance.config);
    switch (instance.driver) {
      case "mock":
        return { driver: createMockCourierDriver(mockCourierConfigSchema.parse(config)), driverName: "mock" };
      case "steadfast":
        return { driver: createSteadfastDriver(steadfastConfigSchema.parse(config)), driverName: "steadfast" };
      case "pathao":
        return { driver: createPathaoDriver(pathaoConfigSchema.parse(config)), driverName: "pathao" };
      case "redx":
        return { driver: createRedxDriver(redxConfigSchema.parse(config)), driverName: "redx" };
      default:
        throw new BadRequestException({ code: "UNKNOWN_COURIER_DRIVER", message: `No courier driver "${instance.driver}"` });
    }
  }
}
