import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { NotifyMeService } from "./notify-me.service";
import { createNotifyMeSchema, type CreateNotifyMeDto } from "./dto";

@ApiTags("store")
@Controller("store/notify-me")
export class NotifyMeController {
  constructor(private readonly notifyMe: NotifyMeService) {}

  @Post()
  create(@Body(new ZodValidationPipe(createNotifyMeSchema)) body: CreateNotifyMeDto) {
    return this.notifyMe.create(body);
  }
}
