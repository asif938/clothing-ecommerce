import { Module } from "@nestjs/common";
import { AutomationOutboxService } from "./automation-outbox.service";

@Module({ providers: [AutomationOutboxService], exports: [AutomationOutboxService] })
export class AutomationOutboxModule {}
