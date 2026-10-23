import { Global, Module } from "@nestjs/common";
import { RevalidationService } from "./revalidation.service";

/** @Global: settings, CMS, catalog etc. all trigger revalidation on change. */
@Global()
@Module({
  providers: [RevalidationService],
  exports: [RevalidationService],
})
export class RevalidationModule {}
