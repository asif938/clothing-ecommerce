import { randomUUID } from "node:crypto";
import { hashPassword, generateTotpSecret } from "@clothing/shared/crypto";
import type { PrismaClient } from "@prisma/client";

/**
 * §14 "Seed data for tests: deterministic factories in
 * packages/db/factories". Each factory takes the Prisma client to use (so
 * tests can pass a transaction client or a real `PrismaService`) plus
 * overrides, and returns the created row — scoped to what this project's
 * integration/E2E tests actually exercise (auth/RBAC, catalog browsing,
 * checkout), not every model in the schema.
 */

let counter = 0;
/** A short, readable, collision-free-enough-for-tests suffix (not cryptographically unique — `randomUUID()` below is used wherever that actually matters, e.g. emails). */
function next(): number {
  counter += 1;
  return counter;
}

export async function createRole(
  prisma: PrismaClient,
  overrides: { name?: string; permissions?: string[]; isSystem?: boolean } = {},
) {
  const role = await prisma.role.create({
    data: { name: overrides.name ?? `Test Role ${next()}`, isSystem: overrides.isSystem ?? false },
  });
  for (const permission of overrides.permissions ?? []) {
    await prisma.rolePermission.create({ data: { roleId: role.id, permission } });
  }
  return role;
}

export interface StaffUserFactoryResult {
  id: string;
  email: string;
  password: string;
  totpSecret: string | null;
}

/** `totpEnabled: true` (the default) matches this project's real-world shape post-M9 — StaffAuthGuard requires it for every route but `/auth/{me,logout,totp/*}` (§12). Pass `false` only when a test specifically exercises the pre-2FA-setup state. */
export async function createStaffUser(
  prisma: PrismaClient,
  overrides: { email?: string; password?: string; totpEnabled?: boolean; roleIds?: string[] } = {},
): Promise<StaffUserFactoryResult> {
  const password = overrides.password ?? "a-very-strong-test-password-123";
  const totpEnabled = overrides.totpEnabled ?? true;
  const totpSecret = totpEnabled ? generateTotpSecret() : null;
  const email = overrides.email ?? `staff-${randomUUID()}@example.test`;

  const staffUser = await prisma.staffUser.create({
    data: {
      name: `Test Staff ${next()}`,
      email,
      passwordHash: await hashPassword(password),
      totpEnabled,
      totpSecret,
      status: "active",
    },
  });
  for (const roleId of overrides.roleIds ?? []) {
    await prisma.staffRole.create({ data: { staffUserId: staffUser.id, roleId } });
  }
  return { id: staffUser.id, email, password, totpSecret };
}

export async function createCustomer(prisma: PrismaClient, overrides: { phone?: string; name?: string } = {}) {
  return await prisma.customer.create({
    data: {
      phone: overrides.phone ?? `017${String(10000000 + next()).padStart(8, "0")}`,
      name: overrides.name ?? `Test Customer ${next()}`,
      status: "active",
    },
  });
}

export async function createCategory(prisma: PrismaClient, overrides: { slug?: string; name?: { bn: string; en: string } } = {}) {
  const n = next();
  return await prisma.category.create({
    data: {
      slug: overrides.slug ?? `test-category-${n}`,
      name: overrides.name ?? { bn: `টেস্ট ক্যাটাগরি ${n}`, en: `Test Category ${n}` },
      isActive: true,
    },
  });
}

/**
 * A single-variant ("free size") product with stock at a location — the
 * minimum needed to add it to a cart and check out. Pass `locationId` from
 * `createStockLocation` (or a seeded one); omit `categoryId` for a
 * product with no category.
 */
export async function createProductWithVariant(
  prisma: PrismaClient,
  locationId: string,
  overrides: { slug?: string; title?: { bn: string; en: string }; categoryId?: string; price?: number; onHand?: number; status?: "draft" | "active" } = {},
) {
  const n = next();
  const product = await prisma.product.create({
    data: {
      slug: overrides.slug ?? `test-product-${n}`,
      title: overrides.title ?? { bn: `টেস্ট পণ্য ${n}`, en: `Test Product ${n}` },
      categoryId: overrides.categoryId,
      status: overrides.status ?? "active",
      publishedAt: new Date(),
    },
  });
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: `TEST-SKU-${n}`,
      price: overrides.price ?? 100000,
      weightGrams: 400,
    },
  });
  await prisma.inventoryLevel.create({ data: { variantId: variant.id, locationId, onHand: overrides.onHand ?? 10 } });
  return { product, variant };
}

export async function createStockLocation(prisma: PrismaClient, overrides: { isDefault?: boolean } = {}) {
  return await prisma.stockLocation.create({
    data: { name: `Test Warehouse ${next()}`, isDefault: overrides.isDefault ?? true, isActive: true, fulfillsOnline: true },
  });
}
