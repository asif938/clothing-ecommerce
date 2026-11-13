import { Module } from "@nestjs/common";
import { StoreCreditLedgerService } from "./store-credit-ledger.service";
import { GiftCardLedgerService } from "./gift-card-ledger.service";
import { OrderTendersService } from "./order-tenders.service";

/**
 * §16 M16 ledgers for store credit and gift cards, plus the order-tender
 * helpers. Kept free of feature-module imports so order lifecycle, checkout,
 * refunds and returns can depend on it without cycles; the admin/storefront
 * features live in `StoreCreditModule` and `GiftCardsModule`.
 */
@Module({
  providers: [StoreCreditLedgerService, GiftCardLedgerService, OrderTendersService],
  exports: [StoreCreditLedgerService, GiftCardLedgerService, OrderTendersService],
})
export class RewardsCoreModule {}
