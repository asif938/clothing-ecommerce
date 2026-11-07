import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { NotifyMeController } from "./notify-me.controller";
import { NotifyMeService } from "./notify-me.service";

@Module({ imports: [NotificationsModule], controllers: [NotifyMeController], providers: [NotifyMeService], exports: [NotifyMeService] })
export class NotifyMeModule {}
