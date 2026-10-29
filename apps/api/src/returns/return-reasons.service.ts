import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import type { CreateReturnReasonDto, UpdateReturnReasonDto } from "./dto";

/** §6.10 "Reasons list (admin-managed, localized): size too small, …". Seeded with the spec's defaults in `packages/db/src/seed.ts`. */
@Injectable()
export class ReturnReasonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.returnReason.findMany({ orderBy: { position: "asc" } });
  }

  async create(dto: CreateReturnReasonDto, actor: AuthenticatedStaff) {
    const reason = await this.prisma.returnReason.create({ data: { ...dto, label: dto.label as Prisma.InputJsonValue } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "return_reason.create", entityType: "return_reason", entityId: reason.id, after: reason });
    return reason;
  }

  async update(id: string, dto: UpdateReturnReasonDto, actor: AuthenticatedStaff) {
    const before = await this.prisma.returnReason.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Return reason not found");
    const { label, ...rest } = dto;
    const reason = await this.prisma.returnReason.update({ where: { id }, data: { ...rest, ...(label !== undefined ? { label: label as Prisma.InputJsonValue } : {}) } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "return_reason.update", entityType: "return_reason", entityId: id, before, after: reason });
    return reason;
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.prisma.returnReason.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Return reason not found");
    await this.prisma.returnReason.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "return_reason.delete", entityType: "return_reason", entityId: id, before });
  }
}
