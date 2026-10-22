/**
 * `pnpm db:seed` — base data only: the "Super Admin" system role (granted
 * every permission in the catalog), default UI strings, and the Bangladesh
 * locations tree. `pnpm db:seed --demo` additionally sets a few "Demo
 * Fashion" brand settings; the rest of the demo seed (catalog, pages, menus,
 * orders) lands as each milestone that owns that data arrives (§4.4.6).
 *
 * Settings rows are intentionally NOT seeded: `settings` is a sparse
 * override table and missing keys fall back to the registry's own default
 * (docs/PROJECT_SPEC.md §4.1), so seeding every default here would only be
 * redundant data to keep in sync.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PERMISSIONS, UI_STRING_DEFAULTS } from "@clothing/shared";

const isDemo = process.argv.includes("--demo");
const prisma = new PrismaClient();

interface BdLocationsFile {
  source: string;
  license: string;
  retrievedDate: string;
  divisions: { code: string; nameBn: string; nameEn: string }[];
  districts: { code: string; divisionCode: string; nameBn: string; nameEn: string }[];
  areas: {
    districtCode: string;
    nameBn: string;
    nameEn: string;
    type: "upazila" | "thana" | "city_area";
    isDhakaCity: boolean;
    postcode: string | null;
  }[];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function seedSuperAdminRole() {
  const role = await prisma.role.upsert({
    where: { name: "Super Admin" },
    update: { isSystem: true },
    create: { name: "Super Admin", description: "Full access to every module.", isSystem: true },
  });

  for (const permission of PERMISSIONS) {
    await prisma.rolePermission.upsert({
      where: { roleId_permission: { roleId: role.id, permission: permission.key } },
      update: {},
      create: { roleId: role.id, permission: permission.key },
    });
  }

  console.log(`[db:seed] "Super Admin" role has ${PERMISSIONS.length} permissions.`);
  return role;
}

async function seedUiStrings() {
  for (const entry of UI_STRING_DEFAULTS) {
    await prisma.uiString.upsert({
      where: { key: entry.key },
      // Never overwrite an admin's edit with the seed default.
      update: {},
      create: { key: entry.key, bn: entry.bn, en: entry.en },
    });
  }
  console.log(`[db:seed] ${UI_STRING_DEFAULTS.length} UI strings ensured.`);
}

async function seedLocations() {
  const filePath = join(__dirname, "seed-data", "bd-locations.json");
  const data = JSON.parse(readFileSync(filePath, "utf8")) as BdLocationsFile;

  const divisionIdByCode = new Map<string, string>();
  for (const division of data.divisions) {
    const row = await prisma.division.upsert({
      where: { code: division.code },
      update: { name: { bn: division.nameBn, en: division.nameEn } },
      create: { code: division.code, name: { bn: division.nameBn, en: division.nameEn } },
    });
    divisionIdByCode.set(division.code, row.id);
  }

  const districtIdByCode = new Map<string, string>();
  for (const district of data.districts) {
    const divisionId = divisionIdByCode.get(district.divisionCode);
    if (!divisionId) {
      throw new Error(`Unknown division code "${district.divisionCode}" for district "${district.code}"`);
    }
    const row = await prisma.district.upsert({
      where: { code: district.code },
      update: { name: { bn: district.nameBn, en: district.nameEn }, divisionId },
      create: { code: district.code, divisionId, name: { bn: district.nameBn, en: district.nameEn } },
    });
    districtIdByCode.set(district.code, row.id);
  }

  let areaCount = 0;
  for (const area of data.areas) {
    const districtId = districtIdByCode.get(area.districtCode);
    if (!districtId) {
      throw new Error(`Unknown district code "${area.districtCode}" for area "${area.nameEn}"`);
    }
    const code = `${area.districtCode}-${slugify(area.nameEn)}`;
    await prisma.area.upsert({
      where: { code },
      update: {
        name: { bn: area.nameBn, en: area.nameEn },
        type: area.type,
        isDhakaCity: area.isDhakaCity,
        postcode: area.postcode,
      },
      create: {
        code,
        districtId,
        name: { bn: area.nameBn, en: area.nameEn },
        type: area.type,
        isDhakaCity: area.isDhakaCity,
        postcode: area.postcode,
      },
    });
    areaCount += 1;
  }

  console.log(
    `[db:seed] Locations: ${data.divisions.length} divisions, ${data.districts.length} districts, ${areaCount} areas (source: ${data.source}).`,
  );
}

/** Milestone 2 (docs/PROJECT_SPEC.md §16 M2): "stock locations (one seeded)" — a fresh install needs somewhere to hold inventory before the owner adds real warehouses. */
async function seedDefaultStockLocation() {
  const existing = await prisma.stockLocation.findFirst();
  if (existing) return;
  await prisma.stockLocation.create({ data: { name: "Main warehouse", isDefault: true, isActive: true, fulfillsOnline: true } });
  console.log('[db:seed] Default stock location "Main warehouse" created.');
}

async function seedDemoBrand() {
  const overrides: [string, unknown][] = [
    ["brand.name", { bn: "ডেমো ফ্যাশন", en: "Demo Fashion" }],
    ["brand.legalName", "Demo Fashion Ltd."],
    ["brand.phone", "+8801700000000"],
    ["brand.email", "hello@demofashion.test"],
  ];
  for (const [key, value] of overrides) {
    await prisma.setting.upsert({
      where: { key },
      update: { value: value as object },
      create: { key, value: value as object },
    });
  }
  console.log(
    '[db:seed] Demo brand settings applied ("Demo Fashion"). Demo catalog/pages/menus/orders are seeded by the ' +
      "milestone that introduces that data (§4.4.6) — not implemented yet.",
  );
}

async function main() {
  await seedSuperAdminRole();
  await seedUiStrings();
  await seedLocations();
  await seedDefaultStockLocation();
  if (isDemo) {
    await seedDemoBrand();
  }
  console.log(`[db:seed] Done (${isDemo ? "base + demo" : "base"}).`);
}

main()
  .catch((error) => {
    console.error("[db:seed] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
