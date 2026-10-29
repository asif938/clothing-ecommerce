import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import type { CreateCourierAreaMappingDto, UpdateCourierAreaMappingDto } from "./dto";

/** §10.2 "area mapping tool in admin" — our division/district/area → a specific courier instance's own location codes (Pathao city:zone:area, RedX area id, …), looked up by `ShipmentsService` when booking with a driver that needs one. */
@Injectable()
export class CourierAreaMappingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(courierProviderInstanceId?: string) {
    return await this.prisma.courierAreaMapping.findMany({
      where: courierProviderInstanceId ? { courierProviderInstanceId } : undefined,
      orderBy: { createdAt: "desc" },
    });
  }

  async findFor(courierProviderInstanceId: string, divisionId: string, districtId: string, areaId: string | null) {
    if (areaId) {
      const exact = await this.prisma.courierAreaMapping.findFirst({ where: { courierProviderInstanceId, divisionId, districtId, areaId } });
      if (exact) return exact;
    }
    return await this.prisma.courierAreaMapping.findFirst({ where: { courierProviderInstanceId, divisionId, districtId, areaId: null } });
  }

  async create(dto: CreateCourierAreaMappingDto, actor: AuthenticatedStaff) {
    const mapping = await this.prisma.courierAreaMapping.create({ data: dto });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "courier_area_mapping.create", entityType: "courier_area_mapping", entityId: mapping.id, after: mapping });
    return mapping;
  }

  async update(id: string, dto: UpdateCourierAreaMappingDto, actor: AuthenticatedStaff) {
    const before = await this.prisma.courierAreaMapping.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Mapping not found");
    const mapping = await this.prisma.courierAreaMapping.update({ where: { id }, data: dto });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "courier_area_mapping.update", entityType: "courier_area_mapping", entityId: id, before, after: mapping });
    return mapping;
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.prisma.courierAreaMapping.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Mapping not found");
    await this.prisma.courierAreaMapping.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "courier_area_mapping.delete", entityType: "courier_area_mapping", entityId: id, before });
  }
}
