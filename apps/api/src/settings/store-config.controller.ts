import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { SettingsService } from "./settings.service";

/** `GET /store/config` — every `public: true` setting, for the storefront (§4.1). No auth: brand/theme/locale config is not sensitive. */
@ApiTags("store")
@Controller("store/config")
export class StoreConfigController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  async get() {
    return await this.settings.getPublicConfig();
  }
}
