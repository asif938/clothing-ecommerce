import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CustomerContextGuard } from "../customer-auth/customer-context.guard";
import { RequireCustomerAuthGuard } from "../customer-auth/require-customer-auth.guard";
import { CacheService } from "../cache/cache.service";
import { SettingsService } from "../settings/settings.service";
import { assertFeatureEnabled } from "../rewards-core/feature";
import { takeGiftCardCheckToken } from "../rewards-core/gift-card-rate-limit";
import { GiftCardsService } from "./gift-cards.service";
import { GiftCardPurchaseService } from "./gift-card-purchase.service";
import {
  adjustGiftCardSchema,
  giftCardCodeSchema,
  issueGiftCardSchema,
  listGiftCardsSchema,
  purchaseGiftCardSchema,
  reissueGiftCardSchema,
  setGiftCardStatusSchema,
  type AdjustGiftCardDto,
  type GiftCardCodeDto,
  type IssueGiftCardDto,
  type ListGiftCardsDto,
  type PurchaseGiftCardDto,
  type ReissueGiftCardDto,
  type SetGiftCardStatusDto,
} from "./dto";

@ApiTags("gift-cards")
@Controller("admin/gift-cards")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("gift_cards.manage")
export class GiftCardsAdminController {
  constructor(private readonly giftCards: GiftCardsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listGiftCardsSchema)) query: ListGiftCardsDto) {
    return this.giftCards.list(query);
  }

  @Get("stats")
  stats() {
    return this.giftCards.stats();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.giftCards.get(id);
  }

  @Post()
  issue(@Body(new ZodValidationPipe(issueGiftCardSchema)) body: IssueGiftCardDto, @Req() req: Request) {
    return this.giftCards.issue(body, req.staff!);
  }

  @Patch(":id/status")
  setStatus(@Param("id") id: string, @Body(new ZodValidationPipe(setGiftCardStatusSchema)) body: SetGiftCardStatusDto, @Req() req: Request) {
    return this.giftCards.setStatus(id, body, req.staff!);
  }

  @Post(":id/adjust")
  adjust(@Param("id") id: string, @Body(new ZodValidationPipe(adjustGiftCardSchema)) body: AdjustGiftCardDto, @Req() req: Request) {
    return this.giftCards.adjust(id, body, req.staff!);
  }

  @Post(":id/reissue")
  reissue(@Param("id") id: string, @Body(new ZodValidationPipe(reissueGiftCardSchema)) body: ReissueGiftCardDto, @Req() req: Request) {
    return this.giftCards.reissue(id, body, req.staff!);
  }
}

/** Storefront gift cards: buy (§7.3 `/gift-cards`), check a balance, move a card into the wallet. */
@ApiTags("store")
@Controller("store/gift-cards")
@UseGuards(CustomerContextGuard)
export class StoreGiftCardsController {
  constructor(
    private readonly giftCards: GiftCardsService,
    private readonly purchases: GiftCardPurchaseService,
    private readonly settings: SettingsService,
    private readonly cache: CacheService,
  ) {}

  @Get("options")
  options() {
    return this.purchases.options();
  }

  @Post("purchase")
  purchase(@Body(new ZodValidationPipe(purchaseGiftCardSchema)) body: PurchaseGiftCardDto, @Req() req: Request) {
    return this.purchases.purchase(body, req.customerContext!.customer?.id ?? null);
  }

  @Get("purchase/:token")
  status(@Param("token") token: string) {
    return this.purchases.status(token);
  }

  @Post("balance")
  @HttpCode(200)
  async balance(@Body(new ZodValidationPipe(giftCardCodeSchema)) body: GiftCardCodeDto, @Req() req: Request) {
    await assertFeatureEnabled(this.settings, "giftCards.enabled");
    await this.takeCheckToken(req);
    return this.giftCards.publicBalance(body.code);
  }

  @Post("wallet")
  @UseGuards(RequireCustomerAuthGuard)
  @HttpCode(200)
  async toWallet(@Body(new ZodValidationPipe(giftCardCodeSchema)) body: GiftCardCodeDto, @Req() req: Request) {
    await assertFeatureEnabled(this.settings, "giftCards.enabled");
    await assertFeatureEnabled(this.settings, "storeCredit.enabled");
    await this.takeCheckToken(req);
    return this.giftCards.transferToWallet(body.code, req.customerContext!.customer!.id);
  }

  /** Per-visitor hourly cap on code lookups, so codes can't be guessed by brute force (shared with the cart's apply-code endpoint). */
  private async takeCheckToken(req: Request): Promise<void> {
    await takeGiftCardCheckToken(this.cache, this.settings, req.customerContext!.anonymousId ?? req.ip ?? "unknown");
  }
}
