import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** Validates a division/district/area chain forms a real, consistent path (docs/PROJECT_SPEC.md §5.2) — used by addresses, carts, and shipping-zone matching wherever a location id comes from outside the server. */
@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async validateChain(divisionId: string, districtId: string, areaId: string) {
    const area = await this.prisma.area.findUnique({ where: { id: areaId }, include: { district: true } });
    if (!area || !area.isActive) throw new BadRequestException({ code: "INVALID_AREA", message: "Unknown area" });
    if (area.districtId !== districtId) throw new BadRequestException({ code: "INVALID_LOCATION_CHAIN", message: "Area does not belong to the given district" });
    if (area.district.divisionId !== divisionId) throw new BadRequestException({ code: "INVALID_LOCATION_CHAIN", message: "District does not belong to the given division" });
    return area;
  }

  resolveArea(areaId: string) {
    return this.prisma.area.findUnique({ where: { id: areaId }, include: { district: { include: { division: true } } } });
  }
}
