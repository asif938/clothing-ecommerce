import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import type { CreateSizeSystemDto, UpdateSizeSystemDto } from "./dto";

@Injectable()
export class SizeSystemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return await this.prisma.sizeSystem.findMany({ orderBy: { createdAt: "asc" } });
  }

  async get(id: string) {
    const system = await this.prisma.sizeSystem.findUnique({ where: { id } });
    if (!system) throw new NotFoundException("Size system not found");
    return system;
  }

  async create(dto: CreateSizeSystemDto, actor: AuthenticatedStaff) {
    const system = await this.prisma.sizeSystem.create({ data: { name: dto.name, type: dto.type, values: dto.values } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "size_system.create", entityType: "size_system", entityId: system.id, after: { name: dto.name } });
    return system;
  }

  async update(id: string, dto: UpdateSizeSystemDto, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    const system = await this.prisma.sizeSystem.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.values !== undefined ? { values: dto.values } : {}),
      },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "size_system.update", entityType: "size_system", entityId: id, before: { name: before.name }, after: { name: system.name } });
    return system;
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    const usageCount = await this.prisma.productOption.count({ where: { sizeSystemId: id } });
    if (usageCount > 0) throw new BadRequestException({ code: "SIZE_SYSTEM_IN_USE", message: "Remove it from products first" });
    await this.prisma.sizeSystem.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "size_system.delete", entityType: "size_system", entityId: id, before: { name: before.name } });
  }
}
