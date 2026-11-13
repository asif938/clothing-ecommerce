import { Module, type OnModuleInit } from "@nestjs/common";
import { SchedulerService } from "../queue/scheduler.service";
import { CustomerContextModule } from "../customer-auth/customer-context.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PaymentsModule } from "../payments/payments.module";
import { PaymentsService } from "../payments/payments.service";
import { RewardsCoreModule } from "../rewards-core/rewards-core.module";
import { GiftCardsService } from "./gift-cards.service";
import { GiftCardPurchaseService } from "./gift-card-purchase.service";
import { GiftCardsAdminController, StoreGiftCardsController } from "./gift-cards.controller";

/** Gift cards — buy, send, redeem (§5.8, §16 M16). Redemption at checkout is a cart tender (`CartPricingService`). */
@Module({
  imports: [CustomerContextModule, NotificationsModule, PaymentsModule, RewardsCoreModule],
  controllers: [GiftCardsAdminController, StoreGiftCardsController],
  providers: [GiftCardsService, GiftCardPurchaseService],
  exports: [GiftCardsService],
})
export class GiftCardsModule implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly payments: PaymentsService,
    private readonly giftCards: GiftCardsService,
    private readonly purchases: GiftCardPurchaseService,
  ) {}

  onModuleInit(): void {
    // Gateway callbacks for a reference no order payment knows are offered to gift card purchases.
    this.payments.registerStandaloneHandler((method, externalRef, payload) => this.purchases.settle(method, externalRef, payload));
    this.scheduler.registerRecurring("gift_cards.sweeps", async () => {
      await this.purchases.sweep();
      await this.giftCards.expirySweep();
    });
  }
}
