import { Module } from "@nestjs/common";
import { ConfigBundleController } from "./config-bundle.controller";
import { ConfigBundleService } from "./config-bundle.service";

/** Config bundle export/import (docs/PROJECT_SPEC.md §16 M17). Prisma, audit, settings and revalidation are global. */
@Module({ controllers: [ConfigBundleController], providers: [ConfigBundleService] })
export class ConfigBundleModule {}
