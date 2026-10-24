import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LocationsService } from "../locations/locations.service";
import type { UpsertAddressDto } from "./dto";

/** Customer saved addresses (docs/PROJECT_SPEC.md §5.5, §7.5 "saved addresses for logged-in customers"). */
@Injectable()
export class AddressesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
  ) {}

  list(customerId: string) {
    return this.prisma.address.findMany({ where: { customerId }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });
  }

  async create(customerId: string, dto: UpsertAddressDto) {
    await this.locations.validateChain(dto.divisionId, dto.districtId, dto.areaId);
    if (dto.isDefault) await this.prisma.address.updateMany({ where: { customerId }, data: { isDefault: false } });
    return await this.prisma.address.create({ data: { customerId, ...dto } });
  }

  async update(customerId: string, id: string, dto: UpsertAddressDto) {
    await this.assertOwned(customerId, id);
    await this.locations.validateChain(dto.divisionId, dto.districtId, dto.areaId);
    if (dto.isDefault) await this.prisma.address.updateMany({ where: { customerId, id: { not: id } }, data: { isDefault: false } });
    return await this.prisma.address.update({ where: { id }, data: dto });
  }

  async remove(customerId: string, id: string): Promise<void> {
    await this.assertOwned(customerId, id);
    await this.prisma.address.delete({ where: { id } });
  }

  private async assertOwned(customerId: string, id: string): Promise<void> {
    const address = await this.prisma.address.findUnique({ where: { id } });
    if (!address) throw new NotFoundException("Address not found");
    if (address.customerId !== customerId) throw new ForbiddenException({ code: "FORBIDDEN", message: "Not your address" });
  }
}
