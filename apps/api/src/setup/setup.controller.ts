import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  confirmSuperAdminTotpSchema,
  createSuperAdminSchema,
  type ConfirmSuperAdminTotpDto,
  type CreateSuperAdminDto,
} from "./dto";
import { SetupService } from "./setup.service";

/** No auth guard: this is exactly the "no Super Admin exists yet" bootstrap path (§4.4 item 1). */
@ApiTags("setup")
@Controller("setup")
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Get("status")
  status() {
    return this.setup.status();
  }

  @Post("super-admin")
  createSuperAdmin(@Body(new ZodValidationPipe(createSuperAdminSchema)) body: CreateSuperAdminDto) {
    return this.setup.createSuperAdmin(body.name, body.email, body.password);
  }

  @Post("super-admin/confirm-totp")
  async confirmTotp(@Body(new ZodValidationPipe(confirmSuperAdminTotpSchema)) body: ConfirmSuperAdminTotpDto) {
    await this.setup.confirmSuperAdminTotp(body.staffUserId, body.code);
    return { ok: true };
  }
}
