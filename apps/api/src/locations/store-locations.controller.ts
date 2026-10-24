import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service";

/** Public read-only location tree (docs/PROJECT_SPEC.md §11.2 "locations (divisions/districts/areas)") — backs checkout's cascading address selects. */
@ApiTags("store")
@Controller("store/locations")
export class StoreLocationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("divisions")
  listDivisions() {
    return this.prisma.division.findMany({ orderBy: { code: "asc" } });
  }

  @Get("districts")
  listDistricts(@Query("divisionId") divisionId?: string) {
    return this.prisma.district.findMany({ where: divisionId ? { divisionId } : undefined, orderBy: { code: "asc" } });
  }

  // "Searchable" (§7.5) is done client-side — areas per district are few
  // enough to fetch whole and filter in the browser, which also searches
  // bn/en at once for free instead of juggling a JSON-path OR query here.
  @Get("areas")
  listAreas(@Query("districtId") districtId?: string) {
    return this.prisma.area.findMany({ where: { isActive: true, ...(districtId ? { districtId } : {}) }, orderBy: { code: "asc" } });
  }
}
