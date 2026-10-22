import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { hashPassword } from "@clothing/shared/crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import type { CreateStaffUserDto, UpdateStaffUserDto } from "./dto";

type RequestContext = { ip: string | null; userAgent: string | null };

@Injectable()
export class StaffUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return await this.prisma.staffUser.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        locale: true,
        status: true,
        totpEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        roles: { include: { role: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(dto: CreateStaffUserDto, actor: AuthenticatedStaff, context: RequestContext) {
    const existing = await this.prisma.staffUser.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException({ code: "EMAIL_TAKEN", message: "A staff account with this email already exists" });

    const passwordHash = await hashPassword(dto.password);
    const staffUser = await this.prisma.$transaction(async (tx) => {
      const created = await tx.staffUser.create({
        data: { name: dto.name, email: dto.email, passwordHash, locale: dto.locale },
      });
      if (dto.roleIds.length > 0) {
        await tx.staffRole.createMany({ data: dto.roleIds.map((roleId) => ({ staffUserId: created.id, roleId })) });
      }
      return created;
    });

    await this.audit.record({
      actorType: "staff",
      actorId: actor.id,
      action: "staff.create",
      entityType: "staff_user",
      entityId: staffUser.id,
      after: { name: dto.name, email: dto.email, roleIds: dto.roleIds },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return staffUser;
  }

  async update(staffUserId: string, dto: UpdateStaffUserDto, actor: AuthenticatedStaff, context: RequestContext) {
    const existing = await this.prisma.staffUser.findUnique({ where: { id: staffUserId } });
    if (!existing || existing.deletedAt) throw new NotFoundException("Staff user not found");

    await this.prisma.$transaction(async (tx) => {
      await tx.staffUser.update({
        where: { id: staffUserId },
        data: {
          ...(dto.name ? { name: dto.name } : {}),
          ...(dto.locale ? { locale: dto.locale } : {}),
          ...(dto.status ? { status: dto.status } : {}),
        },
      });
      if (dto.roleIds) {
        await tx.staffRole.deleteMany({ where: { staffUserId } });
        if (dto.roleIds.length > 0) {
          await tx.staffRole.createMany({ data: dto.roleIds.map((roleId) => ({ staffUserId, roleId })) });
        }
      }
      if (dto.status === "disabled") {
        await tx.staffSession.updateMany({ where: { staffUserId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
    });

    await this.audit.record({
      actorType: "staff",
      actorId: actor.id,
      action: "staff.update",
      entityType: "staff_user",
      entityId: staffUserId,
      before: { name: existing.name, status: existing.status },
      after: dto,
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  async softDelete(staffUserId: string, actor: AuthenticatedStaff, context: RequestContext) {
    const existing = await this.prisma.staffUser.findUnique({ where: { id: staffUserId } });
    if (!existing || existing.deletedAt) throw new NotFoundException("Staff user not found");

    await this.prisma.$transaction(async (tx) => {
      await tx.staffUser.update({ where: { id: staffUserId }, data: { deletedAt: new Date(), status: "disabled" } });
      await tx.staffSession.updateMany({ where: { staffUserId, revokedAt: null }, data: { revokedAt: new Date() } });
    });

    await this.audit.record({
      actorType: "staff",
      actorId: actor.id,
      action: "staff.delete",
      entityType: "staff_user",
      entityId: staffUserId,
      before: { name: existing.name, email: existing.email },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }
}
