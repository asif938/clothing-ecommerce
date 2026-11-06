import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { SuperAdminGuard } from "./super-admin.guard";
import type { AuthenticatedStaff } from "./types";

function makeContext(staff: AuthenticatedStaff | undefined): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ staff }) }) } as unknown as ExecutionContext;
}

describe("SuperAdminGuard", () => {
  const guard = new SuperAdminGuard();

  it("throws when no staff is attached", () => {
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });

  it("throws for a staff member who isn't Super Admin, even with every permission", () => {
    const staff: AuthenticatedStaff = { id: "1", name: "A", email: "a@b.com", locale: "bn", permissions: new Set(["providers.manage"]), isSuperAdmin: false, totpEnabled: true };
    expect(() => guard.canActivate(makeContext(staff))).toThrow(ForbiddenException);
  });

  it("allows a Super Admin through", () => {
    const staff: AuthenticatedStaff = { id: "1", name: "A", email: "a@b.com", locale: "bn", permissions: new Set(), isSuperAdmin: true, totpEnabled: true };
    expect(guard.canActivate(makeContext(staff))).toBe(true);
  });
});
