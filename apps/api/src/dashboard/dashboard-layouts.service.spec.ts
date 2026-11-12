import { describe, expect, it, vi } from "vitest";
import { DashboardLayoutsService } from "./dashboard-layouts.service";

function staff(perms: string[]) {
  return { id: "staff-1", name: "A", email: "a@x", locale: "en", permissions: new Set(perms), isSuperAdmin: false, totpEnabled: true };
}

function make(layouts: { scope: string; scopeId: string; widgets: string[] }[], roles: { id: string; name: string }[] = []) {
  const prisma = {
    staffRole: { findMany: vi.fn(() => Promise.resolve(roles.map((role) => ({ role })))) },
    dashboardLayout: {
      findMany: vi.fn(() => Promise.resolve(layouts)),
      upsert: vi.fn(() => Promise.resolve({ id: "d1" })),
      deleteMany: vi.fn(() => Promise.resolve({ count: 1 })),
    },
    role: { findUnique: vi.fn(() => Promise.resolve({ id: "r1" })) },
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  return { service: new DashboardLayoutsService(prisma as never, audit as never), prisma };
}

describe("DashboardLayoutsService.resolve", () => {
  it("falls back to the built-in layout, hiding widgets the viewer can't see", async () => {
    const { service } = make([]);
    const result = await service.resolve(staff(["reports.read"]));
    expect(result.source).toBe("builtin");
    expect(result.widgets).not.toContain("profitSnapshot");
    expect(result.widgets[0]).toBe("alerts");
  });

  it("prefers own layout, then role (by role name), then store default", async () => {
    const layouts = [
      { scope: "default", scopeId: "default", widgets: ["kpis"] },
      { scope: "role", scopeId: "r-b", widgets: ["lowStock"] },
      { scope: "role", scopeId: "r-a", widgets: ["topProducts"] },
    ];
    const roles = [{ id: "r-b", name: "Warehouse" }, { id: "r-a", name: "Call centre" }];
    expect((await make(layouts, roles).service.resolve(staff(["reports.read"]))).widgets).toEqual(["topProducts"]);
    expect((await make([...layouts, { scope: "staff", scopeId: "staff-1", widgets: ["alerts"] }], roles).service.resolve(staff(["reports.read"]))).source).toBe("staff");
    expect((await make([layouts[0]!], roles).service.resolve(staff(["reports.read"]))).source).toBe("default");
  });
});

describe("DashboardLayoutsService.save", () => {
  it("lets anyone save their own layout but not a shared one", async () => {
    const { service, prisma } = make([]);
    await service.save({ scope: "staff", widgets: ["kpis", "bogus"] }, staff(["reports.read"]));
    expect(prisma.dashboardLayout.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ scope: "staff", scopeId: "staff-1", widgets: ["kpis"] }) }));
    await expect(service.save({ scope: "default", widgets: ["kpis"] }, staff(["reports.read"]))).rejects.toMatchObject({ response: { code: "FORBIDDEN" } });
  });

  it("saves a role layout for managers", async () => {
    const { service, prisma } = make([]);
    await service.save({ scope: "role", roleId: "r1", widgets: ["profitSnapshot"] }, staff(["reports.read", "dashboard.layouts.manage"]));
    expect(prisma.dashboardLayout.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { scope_scopeId: { scope: "role", scopeId: "r1" } } }));
  });
});
