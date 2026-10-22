import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { isKnownPermission } from "@clothing/shared/permissions";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import type { CreateRoleDto, UpdateRoleDto } from "./dto";

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return await this.prisma.role.findMany({
      include: { permissions: true, _count: { select: { staff: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(dto: CreateRoleDto, actor: AuthenticatedStaff, context: { ip: string | null; userAgent: string | null }) {
    this.assertKnownPermissions(dto.permissions);

    const role = await this.prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: { name: dto.name, description: dto.description ?? null, isSystem: false },
      });
      if (dto.permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: dto.permissions.map((permission) => ({ roleId: created.id, permission })),
        });
      }
      return created;
    });

    await this.audit.record({
      actorType: "staff",
      actorId: actor.id,
      action: "role.create",
      entityType: "role",
      entityId: role.id,
      after: { name: dto.name, permissions: dto.permissions },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return role;
  }

  async update(roleId: string, dto: UpdateRoleDto, actor: AuthenticatedStaff, context: { ip: string | null; userAgent: string | null }) {
    const existing = await this.prisma.role.findUnique({ where: { id: roleId }, include: { permissions: true } });
    if (!existing) throw new NotFoundException("Role not found");
    if (existing.isSystem && dto.permissions) {
      throw new ForbiddenException({ code: "SYSTEM_ROLE", message: "The Super Admin role's permissions can't be edited" });
    }
    if (dto.permissions) this.assertKnownPermissions(dto.permissions);

    const before = { name: existing.name, permissions: existing.permissions.map((p) => p.permission) };

    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id: roleId },
        data: { ...(dto.name ? { name: dto.name } : {}), ...(dto.description !== undefined ? { description: dto.description } : {}) },
      });
      if (dto.permissions) {
        await tx.rolePermission.deleteMany({ where: { roleId } });
        if (dto.permissions.length > 0) {
          await tx.rolePermission.createMany({ data: dto.permissions.map((permission) => ({ roleId, permission })) });
        }
      }
    });

    await this.audit.record({
      actorType: "staff",
      actorId: actor.id,
      action: "role.update",
      entityType: "role",
      entityId: roleId,
      before,
      after: { name: dto.name ?? existing.name, permissions: dto.permissions ?? before.permissions },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  async delete(roleId: string, actor: AuthenticatedStaff, context: { ip: string | null; userAgent: string | null }) {
    const existing = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!existing) throw new NotFoundException("Role not found");
    if (existing.isSystem) {
      throw new ForbiddenException({ code: "SYSTEM_ROLE", message: "The Super Admin role can't be deleted" });
    }
    await this.prisma.role.delete({ where: { id: roleId } });
    await this.audit.record({
      actorType: "staff",
      actorId: actor.id,
      action: "role.delete",
      entityType: "role",
      entityId: roleId,
      before: { name: existing.name },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  private assertKnownPermissions(permissions: string[]): void {
    const unknown = permissions.filter((p) => !isKnownPermission(p));
    if (unknown.length > 0) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message: `Unknown permission(s): ${unknown.join(", ")}` });
    }
  }
}
