import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CustomerContextGuard } from "../customer-auth/customer-context.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CustomersService } from "../customers/customers.service";
import { ExperimentAssignmentsService } from "../experiments/experiment-assignments.service";
import { CacheService } from "../cache/cache.service";
import { SettingsService } from "../settings/settings.service";
import { GiftCardLedgerService } from "../rewards-core/gift-card-ledger.service";
import { assertFeatureEnabled } from "../rewards-core/feature";
import { takeGiftCardCheckToken } from "../rewards-core/gift-card-rate-limit";
import { ReferralsService } from "../referrals/referrals.service";
import { AffiliatesService } from "../affiliates/affiliates.service";
import { CartService, type CartIdentity } from "./cart.service";
import { CartPricingService, type CartPricingContext } from "./cart-pricing.service";
import {
  addItemSchema,
  selectShippingRateSchema,
  setCartAddressSchema,
  setCodesSchema,
  setCustomerNoteSchema,
  setRedeemPointsSchema,
  setGiftCardSchema,
  setUseStoreCreditSchema,
  setReferralCodeSchema,
  setAffiliateSchema,
  setGiftWrapSchema,
  updateItemSchema,
  type AddItemDto,
  type SelectShippingRateDto,
  type SetCartAddressDto,
  type SetCodesDto,
  type SetCustomerNoteDto,
  type SetRedeemPointsDto,
  type SetGiftCardDto,
  type SetUseStoreCreditDto,
  type SetReferralCodeDto,
  type SetAffiliateDto,
  type SetGiftWrapDto,
  type UpdateItemDto,
} from "./dto";

/** §7.5 cart drawer/page + §11.2 `cart` endpoint group. Every mutation returns the cart AND its freshly-recomputed pricing (golden rule 6 — the client never computes its own total). */
@ApiTags("store")
@Controller("store/cart")
@UseGuards(CustomerContextGuard)
export class CartController {
  constructor(
    private readonly cart: CartService,
    private readonly pricing: CartPricingService,
    private readonly customers: CustomersService,
    private readonly experiments: ExperimentAssignmentsService,
    private readonly settings: SettingsService,
    private readonly cache: CacheService,
    private readonly giftCardLedger: GiftCardLedgerService,
    private readonly referrals: ReferralsService,
    private readonly affiliates: AffiliatesService,
  ) {}

  private identity(req: Request): CartIdentity {
    return { customerId: req.customerContext!.customer?.id ?? null, anonymousId: req.customerContext!.anonymousId };
  }

  private async context(req: Request, paymentMethod?: string): Promise<CartPricingContext> {
    const customerId = req.customerContext!.customer?.id ?? null;
    const customer = customerId ? await this.customers.findById(customerId) : null;
    return {
      customerId,
      phone: customer?.phone ?? req.customerContext!.customer?.phone ?? null,
      isFirstOrder: !customer || customer.ordersCount === 0,
      channel: "web",
      paymentMethod: paymentMethod ?? null,
      visitorId: req.customerContext!.anonymousId,
    };
  }

  private async respond(req: Request, cart: Awaited<ReturnType<CartService["getOrCreateActiveCart"]>>) {
    return { cart, pricing: await this.pricing.price(cart, await this.context(req)) };
  }

  @Get()
  async get(@Req() req: Request) {
    const cart = await this.cart.getOrCreateActiveCart(this.identity(req));
    return await this.respond(req, cart);
  }

  @Post("items")
  async addItem(@Body(new ZodValidationPipe(addItemSchema)) body: AddItemDto, @Req() req: Request) {
    const cart = await this.cart.addItem(this.identity(req), body.variantId, body.quantity);
    // §16 M14 — "add to cart" goal for A/B tests this visitor has seen.
    this.experiments.recordGoalQuietly(req.customerContext!.anonymousId, "add_to_cart");
    return await this.respond(req, cart);
  }

  /** §16 M10 — adds every one of a shop-the-look bundle's component variants in one call. */
  @Post("bundles/:bundleProductId")
  async addBundle(@Param("bundleProductId") bundleProductId: string, @Req() req: Request) {
    const cart = await this.cart.addBundle(this.identity(req), bundleProductId);
    this.experiments.recordGoalQuietly(req.customerContext!.anonymousId, "add_to_cart");
    return await this.respond(req, cart);
  }

  @Patch("items/:id")
  async updateItem(@Param("id") id: string, @Body(new ZodValidationPipe(updateItemSchema)) body: UpdateItemDto, @Req() req: Request) {
    const cart = await this.cart.updateItemQuantity(this.identity(req), id, body.quantity);
    return await this.respond(req, cart);
  }

  @Delete("items/:id")
  async removeItem(@Param("id") id: string, @Req() req: Request) {
    const cart = await this.cart.removeItem(this.identity(req), id);
    return await this.respond(req, cart);
  }

  @Put("codes")
  async setCodes(@Body(new ZodValidationPipe(setCodesSchema)) body: SetCodesDto, @Req() req: Request) {
    // §16 M16 — a friend's referral code typed into the coupon box is treated as a referral, not a coupon.
    const coupons: string[] = [];
    let referralCode: string | null = null;
    const referralOn = await this.settings.getValue<boolean>("referral.enabled");
    for (const code of body.codes) {
      if (referralOn && referralCode === null && (await this.referrals.findReferrer(code))) referralCode = code.trim().toUpperCase();
      else coupons.push(code);
    }
    if (referralCode) await this.cart.setReferralCode(this.identity(req), referralCode);
    const cart = await this.cart.setCodes(this.identity(req), coupons);
    return await this.respond(req, cart);
  }

  /** §16 M16 — apply (or remove with `code: null`) a gift card. Lookups are rate-limited per visitor so codes can't be guessed. */
  @Put("gift-card")
  async setGiftCard(@Body(new ZodValidationPipe(setGiftCardSchema)) body: SetGiftCardDto, @Req() req: Request) {
    if (body.code === null) return await this.respond(req, await this.cart.setGiftCard(this.identity(req), null));
    await assertFeatureEnabled(this.settings, "giftCards.enabled");
    await takeGiftCardCheckToken(this.cache, this.settings, req.customerContext!.anonymousId);
    const found = await this.giftCardLedger.findByCode(body.code);
    if (!found) throw new BadRequestException({ code: "GIFT_CARD_NOT_FOUND", message: "We couldn't find that gift card. Check the code and try again." });
    if (found.unusable === "EXPIRED") throw new BadRequestException({ code: "GIFT_CARD_EXPIRED", message: "This gift card has expired." });
    if (found.unusable === "NO_BALANCE") throw new BadRequestException({ code: "GIFT_CARD_NO_BALANCE", message: "This gift card has no balance left." });
    if (found.unusable) throw new BadRequestException({ code: "GIFT_CARD_NOT_ACTIVE", message: "This gift card can't be used." });
    return await this.respond(req, await this.cart.setGiftCard(this.identity(req), found.card.id));
  }

  @Put("store-credit")
  async setStoreCredit(@Body(new ZodValidationPipe(setUseStoreCreditSchema)) body: SetUseStoreCreditDto, @Req() req: Request) {
    if (body.use) await assertFeatureEnabled(this.settings, "storeCredit.enabled");
    return await this.respond(req, await this.cart.setUseStoreCredit(this.identity(req), body.use));
  }

  /** §16 M16 — remembers a friend's referral code (`?ref=` links call this); `null` removes it. Pricing decides whether it applies. */
  @Put("referral")
  async setReferral(@Body(new ZodValidationPipe(setReferralCodeSchema)) body: SetReferralCodeDto, @Req() req: Request) {
    if (body.code !== null) {
      await assertFeatureEnabled(this.settings, "referral.enabled");
      if (!(await this.referrals.findReferrer(body.code))) throw new BadRequestException({ code: "REFERRAL_INVALID", message: "That referral code isn't valid." });
    }
    return await this.respond(req, await this.cart.setReferralCode(this.identity(req), body.code?.trim().toUpperCase() ?? null));
  }

  /** §16 M16 — an affiliate link click (`?aff=`): counted, and remembered on the cart for the attribution window. Unknown codes are ignored silently. */
  @Post("affiliate")
  @HttpCode(200)
  async setAffiliate(@Body(new ZodValidationPipe(setAffiliateSchema)) body: SetAffiliateDto, @Req() req: Request) {
    const code = await this.affiliates.recordClick(body.code);
    if (code) await this.cart.setAffiliate(this.identity(req), code);
    return { tracked: code !== null };
  }

  @Patch("address")
  async setAddress(@Body(new ZodValidationPipe(setCartAddressSchema)) body: SetCartAddressDto, @Req() req: Request) {
    const cart = await this.cart.setAddress(this.identity(req), body);
    return await this.respond(req, cart);
  }

  @Patch("shipping-rate")
  async selectShippingRate(@Body(new ZodValidationPipe(selectShippingRateSchema)) body: SelectShippingRateDto, @Req() req: Request) {
    const cart = await this.cart.selectShippingRate(this.identity(req), body.rateId);
    return await this.respond(req, cart);
  }

  @Patch("gift-wrap")
  async setGiftWrap(@Body(new ZodValidationPipe(setGiftWrapSchema)) body: SetGiftWrapDto, @Req() req: Request) {
    const cart = await this.cart.setGiftWrap(this.identity(req), body.giftWrap);
    return await this.respond(req, cart);
  }

  @Put("points")
  async setPoints(@Body(new ZodValidationPipe(setRedeemPointsSchema)) body: SetRedeemPointsDto, @Req() req: Request) {
    const cart = await this.cart.setRedeemPoints(this.identity(req), body.points);
    return await this.respond(req, cart);
  }

  @Patch("note")
  async setNote(@Body(new ZodValidationPipe(setCustomerNoteSchema)) body: SetCustomerNoteDto, @Req() req: Request) {
    const cart = await this.cart.setCustomerNote(this.identity(req), body.note);
    return await this.respond(req, cart);
  }

  /** Lets the checkout page preview totals under a candidate payment method before placing the order (payment-rules conditions can key off it). */
  @Get("quote")
  async quote(@Query("paymentMethod") paymentMethod: string | undefined, @Req() req: Request) {
    const cart = await this.cart.getOrCreateActiveCart(this.identity(req));
    return { cart, pricing: await this.pricing.price(cart, await this.context(req, paymentMethod)) };
  }
}
