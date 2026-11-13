import { Module } from "@nestjs/common";
import { ApiKeyGuard } from "./api-key.guard";
import { ApiKeysController, PublicApiController } from "./api-keys.controller";
import { ApiKeysService } from "./api-keys.service";
import { PublicApiService } from "./public-api.service";

/** API keys and the public read-only API (docs/PROJECT_SPEC.md §11.1, §16 M17). */
@Module({
  controllers: [ApiKeysController, PublicApiController],
  providers: [ApiKeysService, PublicApiService, ApiKeyGuard],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
