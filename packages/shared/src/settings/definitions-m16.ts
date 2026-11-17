import { z } from "zod";
import { defineSetting } from "./registry.ts";

/**
 * Milestone 16 (§16 M16) settings — store credit wallet, gift cards,
 * referral program and affiliates. Every feature is off by default (spec
 * §4.2 feature toggles); amounts are poisha (golden rule 3).
 */

const PERMISSION = "settings.rewards.write";

// ---------------------------------------------------------------------------
// Store credit
// ---------------------------------------------------------------------------

export const STORE_CREDIT_ENABLED = defineSetting({
  key: "storeCredit.enabled",
  group: "rewards",
  type: z.boolean(),
  default: false,
  label: { bn: "স্টোর ক্রেডিট ওয়ালেট চালু", en: "Store credit wallet enabled" },
  help: {
    bn: "গ্রাহক চেকআউটে ওয়ালেটের টাকা দিয়ে পরিশোধ করতে পারবেন ও অ্যাকাউন্টে ব্যালান্স দেখবেন। বন্ধ থাকলেও রিফান্ড/রিটার্ন থেকে ক্রেডিট জমা হয়।",
    en: "Customers can pay with their wallet at checkout and see it in their account. Credit from refunds and returns is still recorded while off.",
  },
  secret: false,
  public: true,
  permission: PERMISSION,
  ui: { widget: "toggle" },
});

// ---------------------------------------------------------------------------
// Gift cards
// ---------------------------------------------------------------------------

export const GIFT_CARDS_ENABLED = defineSetting({
  key: "giftCards.enabled",
  group: "rewards",
  type: z.boolean(),
  default: false,
  label: { bn: "গিফট কার্ড চালু", en: "Gift cards enabled" },
  help: { bn: "ওয়েবসাইটে গিফট কার্ড কেনা ও চেকআউটে ব্যবহার", en: "Buy gift cards on the storefront and pay with them at checkout" },
  secret: false,
  public: true,
  permission: PERMISSION,
  ui: { widget: "toggle" },
});

export const GIFT_CARDS_PURCHASE_ENABLED = defineSetting({
  key: "giftCards.purchaseEnabled",
  group: "rewards",
  type: z.boolean(),
  default: true,
  label: { bn: "ওয়েবসাইটে গিফট কার্ড বিক্রি", en: "Sell gift cards on the storefront" },
  help: { bn: "বন্ধ করলে শুধু অ্যাডমিন থেকে ইস্যু করা কার্ড ব্যবহার করা যাবে", en: "When off, only cards issued from the admin panel exist" },
  secret: false,
  public: true,
  permission: PERMISSION,
  ui: { widget: "toggle" },
});

export const GIFT_CARDS_PRESETS = defineSetting({
  key: "giftCards.presets",
  group: "rewards",
  type: z.array(z.number().int().min(100)).max(8),
  default: [50_000, 100_000, 200_000, 500_000],
  label: { bn: "গিফট কার্ডের নির্ধারিত মূল্য (৳)", en: "Gift card preset amounts (৳)" },
  secret: false,
  public: true,
  permission: PERMISSION,
  ui: { widget: "json" },
});

export const GIFT_CARDS_ALLOW_CUSTOM = defineSetting({
  key: "giftCards.allowCustom",
  group: "rewards",
  type: z.boolean(),
  default: true,
  label: { bn: "ক্রেতা নিজে মূল্য লিখতে পারবেন", en: "Shoppers can enter their own amount" },
  secret: false,
  public: true,
  permission: PERMISSION,
  ui: { widget: "toggle" },
});

export const GIFT_CARDS_MIN_AMOUNT = defineSetting({
  key: "giftCards.minAmount",
  group: "rewards",
  type: z.number().int().min(100),
  default: 20_000,
  label: { bn: "সর্বনিম্ন গিফট কার্ড মূল্য", en: "Minimum gift card amount" },
  secret: false,
  public: true,
  permission: PERMISSION,
  ui: { widget: "money" },
});

export const GIFT_CARDS_MAX_AMOUNT = defineSetting({
  key: "giftCards.maxAmount",
  group: "rewards",
  type: z.number().int().min(100),
  default: 2_000_000,
  label: { bn: "সর্বোচ্চ গিফট কার্ড মূল্য", en: "Maximum gift card amount" },
  secret: false,
  public: true,
  permission: PERMISSION,
  ui: { widget: "money" },
});

export const GIFT_CARDS_EXPIRY_MONTHS = defineSetting({
  key: "giftCards.expiryMonths",
  group: "rewards",
  type: z.number().int().min(0).max(120),
  default: 12,
  label: { bn: "গিফট কার্ডের মেয়াদ (মাস, ০ = কখনো শেষ হবে না)", en: "Gift card validity (months, 0 = never expires)" },
  secret: false,
  public: true,
  permission: PERMISSION,
  ui: { widget: "text" },
});

export const GIFT_CARDS_CHECKS_PER_HOUR = defineSetting({
  key: "giftCards.checksPerHour",
  group: "rewards",
  type: z.number().int().min(1).max(1000),
  default: 20,
  label: { bn: "প্রতি ভিজিটর ঘণ্টায় সর্বোচ্চ কোড যাচাই", en: "Gift card code checks per visitor per hour" },
  help: { bn: "কোড অনুমান করে বের করার চেষ্টা আটকায়", en: "Stops people guessing codes" },
  secret: false,
  public: false,
  permission: PERMISSION,
  ui: { widget: "text" },
});

// ---------------------------------------------------------------------------
// Referral program (§6.12)
// ---------------------------------------------------------------------------

export const REFERRAL_ENABLED = defineSetting({
  key: "referral.enabled",
  group: "rewards",
  type: z.boolean(),
  default: false,
  label: { bn: "রেফারেল প্রোগ্রাম চালু", en: "Referral program enabled" },
  help: {
    bn: "বন্ধু প্রথম অর্ডারে ছাড় পান; সেই অর্ডার সম্পন্ন হলে রেফারকারী পুরস্কার পান",
    en: "Friends get a first-order discount; the referrer is rewarded once that order completes",
  },
  secret: false,
  public: true,
  permission: PERMISSION,
  ui: { widget: "toggle" },
});

export const REFERRAL_REFEREE_DISCOUNT_TYPE = defineSetting({
  key: "referral.refereeDiscountType",
  group: "rewards",
  type: z.enum(["percent", "fixed"]),
  default: "percent",
  label: { bn: "বন্ধুর ছাড়ের ধরন", en: "Friend's discount type" },
  secret: false,
  public: true,
  permission: PERMISSION,
  ui: {
    widget: "select",
    options: [
      { value: "percent", label: { bn: "শতাংশ", en: "Percent" } },
      { value: "fixed", label: { bn: "নির্দিষ্ট টাকা", en: "Fixed amount" } },
    ],
  },
});

export const REFERRAL_REFEREE_DISCOUNT_PERCENT = defineSetting({
  key: "referral.refereeDiscountPercent",
  group: "rewards",
  type: z.number().int().min(1).max(100),
  default: 10,
  label: { bn: "বন্ধুর ছাড় (%)", en: "Friend's discount (%)" },
  secret: false,
  public: true,
  permission: PERMISSION,
  ui: { widget: "text" },
});

export const REFERRAL_REFEREE_DISCOUNT_AMOUNT = defineSetting({
  key: "referral.refereeDiscountAmount",
  group: "rewards",
  type: z.number().int().min(0),
  default: 10_000,
  label: { bn: "বন্ধুর ছাড় (নির্দিষ্ট টাকা)", en: "Friend's discount (fixed amount)" },
  secret: false,
  public: true,
  permission: PERMISSION,
  ui: { widget: "money" },
});

export const REFERRAL_REFEREE_MAX_DISCOUNT = defineSetting({
  key: "referral.refereeMaxDiscount",
  group: "rewards",
  type: z.number().int().min(0),
  default: 30_000,
  label: { bn: "শতাংশ ছাড়ের সর্বোচ্চ সীমা (০ = সীমা নেই)", en: "Cap on the percent discount (0 = no cap)" },
  secret: false,
  public: true,
  permission: PERMISSION,
  ui: { widget: "money" },
});

export const REFERRAL_REFEREE_MIN_ORDER = defineSetting({
  key: "referral.refereeMinOrder",
  group: "rewards",
  type: z.number().int().min(0),
  default: 0,
  label: { bn: "ছাড় পেতে সর্বনিম্ন অর্ডার", en: "Minimum order for the friend's discount" },
  secret: false,
  public: true,
  permission: PERMISSION,
  ui: { widget: "money" },
});

export const REFERRAL_COMBINABLE = defineSetting({
  key: "referral.combinableWithCoupons",
  group: "rewards",
  type: z.boolean(),
  default: false,
  label: { bn: "কুপনের সাথে রেফারেল ছাড় একসাথে", en: "Referral discount stacks with coupons" },
  secret: false,
  public: true,
  permission: PERMISSION,
  ui: { widget: "toggle" },
});

export const REFERRAL_REWARD_TYPE = defineSetting({
  key: "referral.rewardType",
  group: "rewards",
  type: z.enum(["store_credit", "points"]),
  default: "store_credit",
  label: { bn: "রেফারকারীর পুরস্কার", en: "Referrer's reward" },
  help: { bn: "পয়েন্টের জন্য লয়্যালটি প্রোগ্রাম চালু থাকতে হবে", en: "Points need the loyalty program to be on" },
  secret: false,
  public: true,
  permission: PERMISSION,
  ui: {
    widget: "select",
    options: [
      { value: "store_credit", label: { bn: "স্টোর ক্রেডিট", en: "Store credit" } },
      { value: "points", label: { bn: "লয়্যালটি পয়েন্ট", en: "Loyalty points" } },
    ],
  },
});

export const REFERRAL_REWARD_AMOUNT = defineSetting({
  key: "referral.rewardAmount",
  group: "rewards",
  type: z.number().int().min(0),
  default: 10_000,
  label: { bn: "পুরস্কার — স্টোর ক্রেডিট", en: "Reward — store credit amount" },
  secret: false,
  public: true,
  permission: PERMISSION,
  ui: { widget: "money" },
});

export const REFERRAL_REWARD_POINTS = defineSetting({
  key: "referral.rewardPoints",
  group: "rewards",
  type: z.number().int().min(0),
  default: 100,
  label: { bn: "পুরস্কার — পয়েন্ট", en: "Reward — points" },
  secret: false,
  public: true,
  permission: PERMISSION,
  ui: { widget: "text" },
});

export const REFERRAL_MAX_REWARDS_PER_MONTH = defineSetting({
  key: "referral.maxRewardsPerMonth",
  group: "rewards",
  type: z.number().int().min(0).max(1000),
  default: 10,
  label: { bn: "একজন রেফারকারী মাসে সর্বোচ্চ কতবার পুরস্কার পাবেন (০ = সীমা নেই)", en: "Max rewards per referrer per month (0 = no limit)" },
  secret: false,
  public: false,
  permission: PERMISSION,
  ui: { widget: "text" },
});

// ---------------------------------------------------------------------------
// Affiliates
// ---------------------------------------------------------------------------

export const AFFILIATES_ENABLED = defineSetting({
  key: "affiliates.enabled",
  group: "rewards",
  type: z.boolean(),
  default: false,
  label: { bn: "অ্যাফিলিয়েট / ইনফ্লুয়েন্সার ট্র্যাকিং চালু", en: "Affiliate / influencer tracking enabled" },
  secret: false,
  public: true,
  permission: PERMISSION,
  ui: { widget: "toggle" },
});

export const AFFILIATES_ATTRIBUTION_DAYS = defineSetting({
  key: "affiliates.attributionDays",
  group: "rewards",
  type: z.number().int().min(1).max(365),
  default: 30,
  label: { bn: "লিংকে ক্লিকের পর কত দিন পর্যন্ত অর্ডার গণ্য হবে", en: "Days after a link click that orders still count" },
  help: { bn: "প্রতি অ্যাফিলিয়েটের জন্য আলাদা করে বদলানো যায়", en: "Can be overridden per affiliate" },
  secret: false,
  public: false,
  permission: PERMISSION,
  ui: { widget: "text" },
});

export const AFFILIATES_MIN_PAYOUT = defineSetting({
  key: "affiliates.minPayout",
  group: "rewards",
  type: z.number().int().min(0),
  default: 50_000,
  label: { bn: "সর্বনিম্ন পেআউট", en: "Minimum payout" },
  help: { bn: "এর কম অনুমোদিত কমিশন থাকলে পেআউট বোতাম সতর্ক করে", en: "The payout screen warns below this approved balance" },
  secret: false,
  public: false,
  permission: PERMISSION,
  ui: { widget: "money" },
});
