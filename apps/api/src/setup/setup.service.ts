import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { hashPassword } from "@clothing/shared/crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthService } from "../auth/auth.service";

const SUPER_ADMIN_ROLE_NAME = "Super Admin";

/**
 * First-run setup wizard (docs/PROJECT_SPEC.md §4.4 item 1): creating the
 * Super Admin and confirming their 2FA. Everything after that (brand,
 * theme, shipping, payment) is just the generic Settings endpoints — "the
 * wizard" is a storefront-facing admin flow over APIs that already exist,
 * not a separate backend concept, so there's no "finish" step to persist.
 */
@Injectable()
export class SetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  async status(): Promise<{ hasSuperAdmin: boolean }> {
    const superAdminRole = await this.prisma.role.findUnique({ where: { name: SUPER_ADMIN_ROLE_NAME } });
    if (!superAdminRole) return { hasSuperAdmin: false };
    const confirmed = await this.prisma.staffUser.findFirst({
      where: { totpEnabled: true, deletedAt: null, roles: { some: { roleId: superAdminRole.id } } },
    });
    return { hasSuperAdmin: Boolean(confirmed) };
  }

  async createSuperAdmin(name: string, email: string, password: string) {
    const { hasSuperAdmin } = await this.status();
    if (hasSuperAdmin) {
      throw new ForbiddenException({ code: "SETUP_COMPLETE", message: "Setup has already been completed" });
    }

    const superAdminRole = await this.prisma.role.findUnique({ where: { name: SUPER_ADMIN_ROLE_NAME } });
    if (!superAdminRole) {
      throw new NotFoundException(
        'The "Super Admin" role is missing — run `pnpm db:seed` before starting setup.',
      );
    }

    const existingUnconfirmed = await this.prisma.staffUser.findFirst({
      where: { deletedAt: null, roles: { some: { roleId: superAdminRole.id } } },
    });
    if (existingUnconfirmed) {
      throw new ConflictException({
        code: "SETUP_IN_PROGRESS",
        message: "A Super Admin account was already started — confirm its 2FA code, or ask an operator to remove it and retry",
      });
    }

    const passwordHash = await hashPassword(password);
    const staffUser = await this.prisma.$transaction(async (tx) => {
      const created = await tx.staffUser.create({ data: { name, email, passwordHash } });
      await tx.staffRole.create({ data: { staffUserId: created.id, roleId: superAdminRole.id } });
      return created;
    });

    const totpSetup = await this.auth.setupTotp(staffUser.id);

    await this.audit.record({
      actorType: "system",
      action: "setup.super_admin.created",
      entityType: "staff_user",
      entityId: staffUser.id,
      after: { name, email },
    });

    return { staffUserId: staffUser.id, ...totpSetup };
  }

  async confirmSuperAdminTotp(staffUserId: string, code: string): Promise<void> {
    const superAdminRole = await this.prisma.role.findUnique({ where: { name: SUPER_ADMIN_ROLE_NAME } });
    const staffUser = await this.prisma.staffUser.findUnique({
      where: { id: staffUserId },
      include: { roles: true },
    });
    const isPendingSuperAdmin =
      staffUser && superAdminRole && !staffUser.totpEnabled && staffUser.roles.some((r) => r.roleId === superAdminRole.id);
    if (!isPendingSuperAdmin) {
      throw new NotFoundException("No pending Super Admin setup for this account");
    }

    await this.auth.confirmTotp(staffUserId, code, { ip: null, userAgent: null });
    await this.audit.record({
      actorType: "system",
      action: "setup.completed",
      entityType: "staff_user",
      entityId: staffUserId,
    });
  }
}
