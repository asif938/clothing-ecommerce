import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { DASHBOARD_WIDGETS, DEFAULT_DASHBOARD_LAYOUT, sanitizeDashboardLayout } from "@clothing/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import type { LayoutScopeQueryDto, SaveLayoutDto } from "./dto";

type LayoutSource = "staff" | "role" | "default" | "builtin";

function asKeys(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Custom dashboards (docs/PROJECT_SPEC.md §8.2 Dashboard "Customizable
 * widgets per role (phase 2)", §16 M12). Resolution, most specific first:
 * the staff member's own layout, then a layout saved for one of their roles
 * (roles taken in name order, for a stable pick), then the store default,
 * then the built-in default. Widgets the viewer can't see are always
 * filtered out, whichever layout supplied them.
 */
@Injectable()
export class DashboardLayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async resolve(staff: AuthenticatedStaff) {
    const roles = await this.prisma.staffRole.findMany({ where: { staffUserId: staff.id }, select: { role: { select: { id: true, name: true } } } });
    const roleIds = roles
      .map((r) => r.role)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => r.id);
    const layouts = await this.prisma.dashboardLayout.findMany({
      where: { OR: [{ scope: "staff", scopeId: staff.id }, { scope: "role", scopeId: { in: roleIds } }, { scope: "default", scopeId: "default" }] },
    });
    const own = layouts.find((l) => l.scope === "staff");
    const role = roleIds.map((id) => layouts.find((l) => l.scope === "role" && l.scopeId === id)).find((l) => l !== undefined);
    const store = layouts.find((l) => l.scope === "default");
    const picked = own ?? role ?? store;
    const source: LayoutSource = own ? "staff" : role ? "role" : store ? "default" : "builtin";
    const canSee = (permission: string) => staff.permissions.has(permission);

    return {
      source,
      widgets: sanitizeDashboardLayout(picked ? asKeys(picked.widgets) : DEFAULT_DASHBOARD_LAYOUT, canSee),
      catalog: DASHBOARD_WIDGETS.filter((w) => canSee(w.permission)).map((w) => ({ key: w.key, label: w.label })),
      canManageShared: staff.permissions.has("dashboard.layouts.manage"),
    };
  }

  private async scopeId(scope: "staff" | "role" | "default", roleId: string | undefined, staff: AuthenticatedStaff): Promise<string> {
    if (scope !== "staff" && !staff.permissions.has("dashboard.layouts.manage")) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "You can only change your own dashboard", missing: ["dashboard.layouts.manage"] });
    }
    if (scope === "staff") return staff.id;
    if (scope === "default") return "default";
    if (!roleId) throw new BadRequestException({ code: "ROLE_REQUIRED", message: "Choose a role" });
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new BadRequestException({ code: "ROLE_NOT_FOUND", message: "Role not found" });
    return role.id;
  }

  async save(dto: SaveLayoutDto, staff: AuthenticatedStaff) {
    const scopeId = await this.scopeId(dto.scope, dto.roleId, staff);
    // Shared layouts keep every catalog widget the saver picked; each viewer's own permissions filter them at read time.
    const widgets = sanitizeDashboardLayout(dto.widgets, () => true);
    const layout = await this.prisma.dashboardLayout.upsert({
      where: { scope_scopeId: { scope: dto.scope, scopeId } },
      create: { scope: dto.scope, scopeId, widgets, updatedBy: staff.id },
      update: { widgets, updatedBy: staff.id },
    });
    await this.audit.record({ actorType: "staff", actorId: staff.id, action: "dashboard_layout.save", entityType: "dashboard_layout", entityId: layout.id, after: { scope: dto.scope, scopeId, widgets } });
    return this.resolve(staff);
  }

  /** Removes a saved layout so the next one down the chain applies again. */
  async reset(dto: LayoutScopeQueryDto, staff: AuthenticatedStaff) {
    const scopeId = await this.scopeId(dto.scope, dto.roleId, staff);
    await this.prisma.dashboardLayout.deleteMany({ where: { scope: dto.scope, scopeId } });
    await this.audit.record({ actorType: "staff", actorId: staff.id, action: "dashboard_layout.reset", entityType: "dashboard_layout", entityId: `${dto.scope}:${scopeId}` });
    return this.resolve(staff);
  }

  /** For the layout editor: what a role or the store default currently has saved (unfiltered); null = nothing saved. */
  async getShared(scope: "role" | "default", roleId: string | undefined) {
    const scopeId = scope === "default" ? "default" : roleId;
    if (!scopeId) return { widgets: null };
    const layout = await this.prisma.dashboardLayout.findUnique({ where: { scope_scopeId: { scope, scopeId } } });
    return { widgets: layout ? asKeys(layout.widgets) : null };
  }
}
