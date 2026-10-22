import { Reflector } from "@nestjs/core";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PermissionsGuard } from "./permissions.guard";
import type { AuthenticatedStaff } from "./types";

function makeContext(staff: AuthenticatedStaff | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ staff }) }),
  } as unknown as ExecutionContext;
}

function makeGuard(required: string[] | undefined): PermissionsGuard {
  const reflector = new Reflector();
  vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(required);
  return new PermissionsGuard(reflector);
}

describe("PermissionsGuard", () => {
  it("allows the request through when no permissions are required", () => {
    const guard = makeGuard(undefined);
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it("throws when a permission is required but no staff is attached", () => {
    const guard = makeGuard(["staff.manage"]);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });

  it("throws when the staff is missing the required permission", () => {
    const guard = makeGuard(["staff.manage"]);
    const staff: AuthenticatedStaff = { id: "1", name: "A", email: "a@b.com", locale: "bn", permissions: new Set(["audit.read"]), isSuperAdmin: false };
    expect(() => guard.canActivate(makeContext(staff))).toThrow(ForbiddenException);
  });

  it("allows the request through when the staff has every required permission", () => {
    const guard = makeGuard(["staff.manage"]);
    const staff: AuthenticatedStaff = { id: "1", name: "A", email: "a@b.com", locale: "bn", permissions: new Set(["staff.manage"]), isSuperAdmin: false };
    expect(guard.canActivate(makeContext(staff))).toBe(true);
  });
});
