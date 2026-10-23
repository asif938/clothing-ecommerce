import { Module } from "@nestjs/common";
import { NotifyMeController } from "./notify-me.controller";
import { NotifyMeService } from "./notify-me.service";

@Module({ controllers: [NotifyMeController], providers: [NotifyMeService] })
export class NotifyMeModule {}
