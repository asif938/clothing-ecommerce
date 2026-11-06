import request from "supertest";
import { generate } from "otplib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { createRole, createStaffUser } from "@clothing/db/factories";
import { createTestApp } from "./setup";
import type { PrismaService } from "../src/prisma/prisma.service";

/**
 * §14 "Auth flows (... staff 2FA), RBAC denials" + §16 M9's mandatory-2FA
 * hardening (apps/api/src/auth/staff-auth.guard.ts): a staff account
 * without TOTP enabled can log in, but every route except
 * `/auth/{me,logout,totp/*}` is locked out (403 TOTP_SETUP_REQUIRED) until
 * they set it up; a staff account with TOTP but no `staff.manage`
 * permission gets a plain RBAC 403 instead.
 */
describe("Auth, mandatory 2FA, and RBAC", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it("forces a staff account without 2FA through setup before any other route works, then lets it through once enabled", async () => {
    const role = await createRole(prisma, { permissions: ["staff.manage"] });
    const staff = await createStaffUser(prisma, { totpEnabled: false, roleIds: [role.id] });

    const agent = request.agent(app.getHttpServer());
    const login = await agent.post("/api/v1/auth/login").send({ email: staff.email, password: staff.password }).expect(201);
    expect(login.body).toEqual({ requiresTotp: false });

    // Exempt route still works.
    await agent.get("/api/v1/auth/me").expect(200);

    // Everything else is locked out until 2FA is set up.
    const blocked = await agent.get("/api/v1/admin/staff").expect(403);
    expect(blocked.body).toMatchObject({ code: "TOTP_SETUP_REQUIRED" });

    const setup = await agent.post("/api/v1/auth/totp/setup").expect(201);
    const secret = new URL((setup.body as { otpauthUrl: string }).otpauthUrl).searchParams.get("secret")!;
    const code = await generate({ secret });
    await agent.post("/api/v1/auth/totp/confirm").send({ code }).expect(201);

    // Now it works — same session, 2FA enabled, has the permission.
    await agent.get("/api/v1/admin/staff").expect(200);
  });

  it("denies a staff account that has 2FA but lacks the required permission (RBAC, not TOTP)", async () => {
    const staff = await createStaffUser(prisma, { totpEnabled: true, roleIds: [] });

    const login = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email: staff.email, password: staff.password }).expect(201);
    expect(login.body).toMatchObject({ requiresTotp: true });
    const loginToken = (login.body as { loginToken: string }).loginToken;

    const agent = request.agent(app.getHttpServer());
    await agent.post("/api/v1/auth/login/totp").send({ loginToken, code: await generate({ secret: staff.totpSecret! }) }).expect(201);

    const denied = await agent.get("/api/v1/admin/staff").expect(403);
    expect(denied.body).toMatchObject({ code: "FORBIDDEN" });
  });

  it("locks the account out after too many failed password attempts", async () => {
    await prisma.setting.create({ data: { key: "security.loginMaxAttempts", value: 2 } });
    const staff = await createStaffUser(prisma, { totpEnabled: true });

    await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email: staff.email, password: "wrong-password-1" }).expect(401);
    await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email: staff.email, password: "wrong-password-2" }).expect(401);

    const lockedOut = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email: staff.email, password: staff.password }).expect(403);
    expect(lockedOut.body).toMatchObject({ code: "ACCOUNT_LOCKED" });
  });
});
