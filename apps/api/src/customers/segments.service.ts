import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import { buildCustomerWhereFromRules, type SegmentRules } from "./segment-rules";
import type { CreateSegmentDto, UpdateSegmentDto } from "./dto";

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

@Injectable()
export class SegmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.segment.findMany({ orderBy: { createdAt: "desc" } });
  }

  async get(id: string) {
    const segment = await this.prisma.segment.findUnique({ where: { id } });
    if (!segment) throw new NotFoundException("Segment not found");
    return segment;
  }

  whereFor(segment: { rules: unknown }): Prisma.CustomerWhereInput {
    return buildCustomerWhereFromRules(segment.rules as SegmentRules);
  }

  async previewCount(rules: SegmentRules): Promise<number> {
    return this.prisma.customer.count({ where: { deletedAt: null, ...buildCustomerWhereFromRules(rules) } });
  }

  async members(segmentId: string, page: number, pageSize: number) {
    const segment = await this.get(segmentId);
    const where: Prisma.CustomerWhereInput = { deletedAt: null, ...this.whereFor(segment) };
    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({ where, orderBy: { totalSpent: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.customer.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async create(dto: CreateSegmentDto, actor: AuthenticatedStaff) {
    const memberCountCache = await this.previewCount(dto.rules);
    const segment = await this.prisma.segment.create({ data: { name: toJson(dto.name), rules: toJson(dto.rules), isDynamic: dto.isDynamic, memberCountCache } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "segment.create", entityType: "segment", entityId: segment.id, after: segment });
    return segment;
  }

  async update(id: string, dto: UpdateSegmentDto, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    const memberCountCache = dto.rules ? await this.previewCount(dto.rules) : undefined;
    const segment = await this.prisma.segment.update({
      where: { id },
      data: {
        ...(dto.name ? { name: toJson(dto.name) } : {}),
        ...(dto.rules ? { rules: toJson(dto.rules) } : {}),
        ...(dto.isDynamic !== undefined ? { isDynamic: dto.isDynamic } : {}),
        ...(memberCountCache !== undefined ? { memberCountCache } : {}),
      },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "segment.update", entityType: "segment", entityId: id, before, after: segment });
    return segment;
  }

  async remove(id: string, actor: AuthenticatedStaff): Promise<void> {
    const before = await this.get(id);
    await this.prisma.segment.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "segment.delete", entityType: "segment", entityId: id, before });
  }
}
