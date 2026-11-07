import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { AbandonedCartService } from "./abandoned-cart.service";

@ApiTags("marketing")
@Controller("admin/abandoned-carts")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("marketing.abandoned_carts.manage")
export class AbandonedCartController {
  constructor(private readonly service: AbandonedCartService) {}

  @Get()
  list() {
    return this.service.listAbandoned();
  }
}
