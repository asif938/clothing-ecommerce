import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service";

/** Only this prefix is public: storefront chrome (header, footer). Admin copy stays behind the staff API. */
export const STOREFRONT_UI_STRING_PREFIX = "storefront.";

/**
 * Golden rule 1 / spec §4.5 — the storefront's own chrome text (menu, cart,
 * account, language switch …) comes from `ui_strings`, so it is editable in
 * the admin panel. The storefront fetches this map with a 60 s cache and the
 * `ui_strings` revalidation tag; missing keys fall back to the seeded defaults.
 */
@ApiTags("store")
@Controller("store/ui-strings")
export class StoreUiStringsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(): Promise<Record<string, { bn: string; en: string }>> {
    const rows = await this.prisma.uiString.findMany({ where: { key: { startsWith: STOREFRONT_UI_STRING_PREFIX } }, select: { key: true, bn: true, en: true } });
    return Object.fromEntries(rows.map((row) => [row.key, { bn: row.bn, en: row.en }]));
  }
}
