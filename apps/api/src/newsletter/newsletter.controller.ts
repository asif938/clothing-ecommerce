import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { subscribeNewsletterSchema, type SubscribeNewsletterDto } from "./dto";

/** `newsletter_signup` block (docs/PROJECT_SPEC.md §9.1). Public, no auth — same trust level as the rest of `/store/*`. */
@ApiTags("store")
@Controller("store/newsletter")
export class NewsletterController {
  constructor(private readonly prisma: PrismaService) {}

  @Post("subscribe")
  async subscribe(@Body(new ZodValidationPipe(subscribeNewsletterSchema)) body: SubscribeNewsletterDto) {
    await this.prisma.newsletterSubscriber.upsert({
      where: { email: body.email },
      update: {},
      create: { email: body.email, locale: body.locale ?? null },
    });
    return { subscribed: true };
  }
}
