/**
 * `pnpm db:seed` — base data only: the "Super Admin" system role (granted
 * every permission in the catalog), default UI strings, and the Bangladesh
 * locations tree. `pnpm db:seed --demo` additionally sets a few "Demo
 * Fashion" brand settings and a small browsable/purchasable demo catalog
 * (Milestone 9 "demo seed polish" — see docs/DECISIONS.md for why it's
 * deliberately small: just enough for the E2E journeys in `e2e/tests/` and
 * a screenshot-ready storefront, not a realistic product count). CMS
 * pages/menus/demo orders are still not seeded here — unlike the catalog,
 * nothing in `e2e/` or the launch checklist depends on them existing.
 *
 * Settings rows are intentionally NOT seeded: `settings` is a sparse
 * override table and missing keys fall back to the registry's own default
 * (docs/PROJECT_SPEC.md §4.1), so seeding every default here would only be
 * redundant data to keep in sync.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, type NotificationChannel, type NotificationEvent } from "@prisma/client";
import { PERMISSIONS, UI_STRING_DEFAULTS } from "@clothing/shared";
import { NOTIFICATION_CHANNELS, NOTIFICATION_EVENTS } from "@clothing/shared/notifications";

const isDemo = process.argv.includes("--demo");
const prisma = new PrismaClient();

interface BdLocationsFile {
  source: string;
  license: string;
  retrievedDate: string;
  divisions: { code: string; nameBn: string; nameEn: string }[];
  districts: { code: string; divisionCode: string; nameBn: string; nameEn: string }[];
  areas: {
    districtCode: string;
    nameBn: string;
    nameEn: string;
    type: "upazila" | "thana" | "city_area";
    isDhakaCity: boolean;
    postcode: string | null;
  }[];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function seedSuperAdminRole() {
  const role = await prisma.role.upsert({
    where: { name: "Super Admin" },
    update: { isSystem: true },
    create: { name: "Super Admin", description: "Full access to every module.", isSystem: true },
  });

  for (const permission of PERMISSIONS) {
    await prisma.rolePermission.upsert({
      where: { roleId_permission: { roleId: role.id, permission: permission.key } },
      update: {},
      create: { roleId: role.id, permission: permission.key },
    });
  }

  console.log(`[db:seed] "Super Admin" role has ${PERMISSIONS.length} permissions.`);
  return role;
}

async function seedUiStrings() {
  for (const entry of UI_STRING_DEFAULTS) {
    await prisma.uiString.upsert({
      where: { key: entry.key },
      // Never overwrite an admin's edit with the seed default.
      update: {},
      create: { key: entry.key, bn: entry.bn, en: entry.en },
    });
  }
  console.log(`[db:seed] ${UI_STRING_DEFAULTS.length} UI strings ensured.`);
}

async function seedLocations() {
  const filePath = join(__dirname, "seed-data", "bd-locations.json");
  const data = JSON.parse(readFileSync(filePath, "utf8")) as BdLocationsFile;

  const divisionIdByCode = new Map<string, string>();
  for (const division of data.divisions) {
    const row = await prisma.division.upsert({
      where: { code: division.code },
      update: { name: { bn: division.nameBn, en: division.nameEn } },
      create: { code: division.code, name: { bn: division.nameBn, en: division.nameEn } },
    });
    divisionIdByCode.set(division.code, row.id);
  }

  const districtIdByCode = new Map<string, string>();
  for (const district of data.districts) {
    const divisionId = divisionIdByCode.get(district.divisionCode);
    if (!divisionId) {
      throw new Error(`Unknown division code "${district.divisionCode}" for district "${district.code}"`);
    }
    const row = await prisma.district.upsert({
      where: { code: district.code },
      update: { name: { bn: district.nameBn, en: district.nameEn }, divisionId },
      create: { code: district.code, divisionId, name: { bn: district.nameBn, en: district.nameEn } },
    });
    districtIdByCode.set(district.code, row.id);
  }

  let areaCount = 0;
  for (const area of data.areas) {
    const districtId = districtIdByCode.get(area.districtCode);
    if (!districtId) {
      throw new Error(`Unknown district code "${area.districtCode}" for area "${area.nameEn}"`);
    }
    const code = `${area.districtCode}-${slugify(area.nameEn)}`;
    await prisma.area.upsert({
      where: { code },
      update: {
        name: { bn: area.nameBn, en: area.nameEn },
        type: area.type,
        isDhakaCity: area.isDhakaCity,
        postcode: area.postcode,
      },
      create: {
        code,
        districtId,
        name: { bn: area.nameBn, en: area.nameEn },
        type: area.type,
        isDhakaCity: area.isDhakaCity,
        postcode: area.postcode,
      },
    });
    areaCount += 1;
  }

  console.log(
    `[db:seed] Locations: ${data.divisions.length} divisions, ${data.districts.length} districts, ${areaCount} areas (source: ${data.source}).`,
  );
}

/** Milestone 2 (docs/PROJECT_SPEC.md §16 M2): "stock locations (one seeded)" — a fresh install needs somewhere to hold inventory before the owner adds real warehouses. */
async function seedDefaultStockLocation() {
  const existing = await prisma.stockLocation.findFirst();
  if (existing) return;
  await prisma.stockLocation.create({ data: { name: "Main warehouse", isDefault: true, isActive: true, fulfillsOnline: true } });
  console.log('[db:seed] Default stock location "Main warehouse" created.');
}

/** Milestone 6 (docs/PROJECT_SPEC.md §6.10): the spec's own example reasons list — admin-managed and localized from here on, never hardcoded in UI code (golden rule 1). */
async function seedDefaultReturnReasons() {
  const existing = await prisma.returnReason.findFirst();
  if (existing) return;
  const reasons: { code: string; label: { bn: string; en: string }; defaultPaidBy: "customer" | "brand" }[] = [
    { code: "size_too_small", label: { bn: "সাইজ ছোট হয়ে গেছে", en: "Size too small" }, defaultPaidBy: "customer" },
    { code: "size_too_large", label: { bn: "সাইজ বড় হয়ে গেছে", en: "Size too large" }, defaultPaidBy: "customer" },
    { code: "damaged", label: { bn: "ক্ষতিগ্রস্ত পণ্য", en: "Damaged" }, defaultPaidBy: "brand" },
    { code: "wrong_item", label: { bn: "ভুল পণ্য পাঠানো হয়েছে", en: "Wrong item" }, defaultPaidBy: "brand" },
    { code: "not_as_described", label: { bn: "বর্ণনার সাথে মিল নেই", en: "Not as described" }, defaultPaidBy: "brand" },
    { code: "changed_mind", label: { bn: "মন পরিবর্তন করেছি", en: "Changed mind" }, defaultPaidBy: "customer" },
  ];
  for (const [index, reason] of reasons.entries()) {
    await prisma.returnReason.create({ data: { ...reason, position: index } });
  }
  console.log(`[db:seed] ${reasons.length} default return reasons created.`);
}

/**
 * Milestone 3 (docs/PROJECT_SPEC.md §16 M3): system pages (home, 404, 500,
 * maintenance — storefront looks these up by reserved slug) and policy
 * placeholders (`needsContent: true`, drives the admin "content needed
 * before launch" checklist, §9.3). Plain block JSON here, not imported
 * from `@clothing/blocks`, so `@clothing/db` doesn't pick up a dependency
 * on that package just for seed data.
 */
async function seedDefaultPages() {
  const heroBlock = {
    id: "seed-hero",
    type: "hero",
    props: {
      heading: { bn: "নতুন কালেকশন এসেছে", en: "New collection is here" },
      subheading: { bn: "", en: "" },
      ctaText: { bn: "শপ করুন", en: "Shop now" },
      ctaUrl: "/",
      imageUrl: null,
      align: "left",
    },
  };
  const bestSellersBlock = {
    id: "seed-best-sellers",
    type: "product_grid",
    props: { heading: { bn: "বেস্ট সেলার", en: "Best sellers" }, source: "best_sellers", limit: 8 },
  };
  const newArrivalsBlock = {
    id: "seed-new-arrivals",
    type: "product_grid",
    props: { heading: { bn: "নতুন পণ্য", en: "New arrivals" }, source: "new_arrivals", limit: 8 },
  };
  // §9.1 testimonials/reviews — renders nothing until the store has approved reviews.
  const reviewsBlock = {
    id: "seed-reviews",
    type: "reviews",
    props: {
      heading: { bn: "গ্রাহকরা যা বলছেন", en: "What our customers say" },
      source: "recent",
      minRating: 4,
      limit: 6,
      testimonials: [],
      verifiedLabel: { bn: "যাচাইকৃত ক্রেতা", en: "Verified purchase" },
      fallbackName: { bn: "গ্রাহক", en: "Customer" },
    },
  };

  const systemPages: { slug: string; title: string; blocks: object[] }[] = [
    { slug: "home", title: "Home", blocks: [heroBlock, newArrivalsBlock, bestSellersBlock, reviewsBlock] },
    { slug: "404", title: "Not found", blocks: [{ id: "seed-404", type: "rich_text", props: { content: { bn: "পেজটি খুঁজে পাওয়া যায়নি।", en: "This page could not be found." }, align: "center" } }] },
    { slug: "500", title: "Server error", blocks: [{ id: "seed-500", type: "rich_text", props: { content: { bn: "কিছু ভুল হয়েছে। পরে আবার চেষ্টা করুন।", en: "Something went wrong. Please try again shortly." }, align: "center" } }] },
    { slug: "maintenance", title: "Maintenance", blocks: [{ id: "seed-maintenance", type: "rich_text", props: { content: { bn: "আমরা রক্ষণাবেক্ষণের জন্য সাময়িকভাবে বন্ধ আছি।", en: "We're down for maintenance — back shortly." }, align: "center" } }] },
  ];

  for (const page of systemPages) {
    const existing = await prisma.page.findUnique({ where: { slug: page.slug } });
    if (existing) continue;
    await prisma.page.create({
      data: { slug: page.slug, title: page.title, status: "published", isSystem: true, blocksDraft: page.blocks, blocksPublished: page.blocks },
    });
  }

  const policyPlaceholders = [
    { slug: "privacy-policy", title: "Privacy policy" },
    { slug: "terms", title: "Terms & conditions" },
    { slug: "returns-exchange", title: "Return & exchange policy" },
    { slug: "shipping-policy", title: "Shipping policy" },
  ];
  for (const page of policyPlaceholders) {
    const existing = await prisma.page.findUnique({ where: { slug: page.slug } });
    if (existing) continue;
    await prisma.page.create({ data: { slug: page.slug, title: page.title, status: "draft", needsContent: true, blocksDraft: [] } });
  }

  console.log(`[db:seed] CMS: ${systemPages.length} system page(s), ${policyPlaceholders.length} policy placeholder(s) ensured.`);
}

/**
 * Milestone 7 (docs/PROJECT_SPEC.md §6.11, §16 M7): one default bn/en
 * template per (event, channel) so the acceptance scenario ("placing,
 * confirming, shipping, delivering an order sends the configured messages")
 * works on a fresh install with no admin editing required. Content keyed by
 * `NOTIFICATION_EVENTS`' catalog (`@clothing/shared/notifications`) — a new
 * event there with no entry here is simply skipped, not a seed error, so
 * adding an event doesn't retroactively break seeding of the others.
 * Channel rules are *not* seeded: an event with no `NotificationChannelRule`
 * row falls back to the catalog's own `defaultChannelOrder` (the same
 * "missing key falls back to the registry default" pattern the settings
 * registry already uses), so there is nothing to seed there.
 */
const NOTIFICATION_TEMPLATE_CONTENT: Record<string, { subjectBn: string; subjectEn: string; bodyBn: string; bodyEn: string }> = {
  otp_verification: {
    subjectBn: "আপনার ভেরিফিকেশন কোড",
    subjectEn: "Your verification code",
    bodyBn: "{brand_name}: আপনার OTP কোড {otp}। এটি কাউকে শেয়ার করবেন না।",
    bodyEn: "{brand_name}: Your OTP code is {otp}. Do not share this with anyone.",
  },
  order_placed: {
    subjectBn: "আপনার অর্ডার {order_number} গ্রহণ করা হয়েছে",
    subjectEn: "Your order {order_number} has been placed",
    bodyBn: "{customer_name}, আপনার অর্ডার {order_number} সফলভাবে গ্রহণ করা হয়েছে। মোট: {order_total}। ধন্যবাদ — {brand_name}",
    bodyEn: "{customer_name}, your order {order_number} has been placed. Total: {order_total}. Thank you — {brand_name}",
  },
  order_confirmed: {
    subjectBn: "আপনার অর্ডার {order_number} কনফার্ম হয়েছে",
    subjectEn: "Your order {order_number} is confirmed",
    bodyBn: "{customer_name}, আপনার অর্ডার {order_number} কনফার্ম করা হয়েছে। মোট: {order_total}। — {brand_name}",
    bodyEn: "{customer_name}, your order {order_number} has been confirmed. Total: {order_total}. — {brand_name}",
  },
  order_shipped: {
    subjectBn: "আপনার অর্ডার {order_number} পাঠানো হয়েছে",
    subjectEn: "Your order {order_number} has shipped",
    bodyBn: "{customer_name}, আপনার অর্ডার {order_number} পাঠানো হয়েছে। ট্র্যাকিং কোড: {tracking_code}। — {brand_name}",
    bodyEn: "{customer_name}, your order {order_number} has shipped. Tracking code: {tracking_code}. — {brand_name}",
  },
  order_out_for_delivery: {
    subjectBn: "আপনার অর্ডার {order_number} ডেলিভারির জন্য বের হয়েছে",
    subjectEn: "Your order {order_number} is out for delivery",
    bodyBn: "{customer_name}, আপনার অর্ডার {order_number} ডেলিভারির জন্য বের হয়েছে। — {brand_name}",
    bodyEn: "{customer_name}, your order {order_number} is out for delivery. — {brand_name}",
  },
  order_delivered: {
    subjectBn: "আপনার অর্ডার {order_number} ডেলিভার হয়েছে",
    subjectEn: "Your order {order_number} has been delivered",
    bodyBn: "{customer_name}, আপনার অর্ডার {order_number} সফলভাবে ডেলিভার করা হয়েছে। ধন্যবাদ! — {brand_name}",
    bodyEn: "{customer_name}, your order {order_number} has been delivered. Thank you! — {brand_name}",
  },
  order_partially_delivered: {
    subjectBn: "আপনার অর্ডার {order_number} আংশিক ডেলিভার হয়েছে",
    subjectEn: "Your order {order_number} was partially delivered",
    bodyBn: "{customer_name}, আপনার অর্ডার {order_number} আংশিকভাবে ডেলিভার করা হয়েছে। সংগৃহীত: {cod_amount}। — {brand_name}",
    bodyEn: "{customer_name}, your order {order_number} was partially delivered. Collected: {cod_amount}. — {brand_name}",
  },
  order_rejected_at_door: {
    subjectBn: "আপনার অর্ডার {order_number} ফেরত দেওয়া হয়েছে",
    subjectEn: "Your order {order_number} was refused at the door",
    bodyBn: "{customer_name}, আপনার অর্ডার {order_number} দরজায় ফেরত দেওয়া হয়েছে। প্রশ্ন থাকলে কল করুন {support_phone}। — {brand_name}",
    bodyEn: "{customer_name}, your order {order_number} was refused at the door. Questions? Call {support_phone}. — {brand_name}",
  },
  order_cancelled: {
    subjectBn: "আপনার অর্ডার {order_number} বাতিল হয়েছে",
    subjectEn: "Your order {order_number} has been cancelled",
    bodyBn: "{customer_name}, আপনার অর্ডার {order_number} বাতিল করা হয়েছে। — {brand_name}",
    bodyEn: "{customer_name}, your order {order_number} has been cancelled. — {brand_name}",
  },
  // Milestone 10 (§16 M10) — abandoned-cart recovery sequence and the
  // back-in-stock notify-me fulfillment.
  abandoned_cart_1: {
    subjectBn: "আপনার কার্টে কিছু অপেক্ষা করছে",
    subjectEn: "You left something in your cart",
    bodyBn: "{customer_name}, আপনার কার্টে {cart_total} মূল্যের পণ্য রয়ে গেছে। এখনই অর্ডার সম্পন্ন করুন: {cart_url} — {brand_name}",
    bodyEn: "{customer_name}, you left {cart_total} worth of items in your cart. Finish your order: {cart_url} — {brand_name}",
  },
  abandoned_cart_2: {
    subjectBn: "আপনার কার্ট এখনও অপেক্ষা করছে",
    subjectEn: "Still thinking it over?",
    bodyBn: "{customer_name}, আপনার কার্টের পণ্যগুলো এখনও অপেক্ষা করছে ({cart_total})। এখনই অর্ডার করুন: {cart_url} — {brand_name}",
    bodyEn: "{customer_name}, the items in your cart ({cart_total}) are still waiting. Order now: {cart_url} — {brand_name}",
  },
  abandoned_cart_3: {
    subjectBn: "আপনার জন্য একটি বিশেষ ছাড়",
    subjectEn: "A special discount, just for you",
    bodyBn: "{customer_name}, আপনার কার্টের পণ্য ({cart_total}) এখনও আছে। কোড {coupon_code} দিয়ে {coupon_percent_off}% ছাড় নিন: {cart_url} — {brand_name}",
    bodyEn: "{customer_name}, your cart ({cart_total}) is still here. Use code {coupon_code} for {coupon_percent_off}% off: {cart_url} — {brand_name}",
  },
  order_confirmation_request: {
    subjectBn: "অর্ডার {order_number} কনফার্ম করুন",
    subjectEn: "Please confirm order {order_number}",
    bodyBn: "{customer_name}, আপনার অর্ডার {order_number} ({order_total}) কনফার্ম করতে এই লিংকে যান: {confirm_link} — {brand_name}",
    bodyEn: "{customer_name}, please confirm your order {order_number} ({order_total}) here: {confirm_link} — {brand_name}",
  },
  back_in_stock: {
    subjectBn: "{product_title} এখন স্টকে আছে",
    subjectEn: "{product_title} is back in stock",
    bodyBn: "আপনি যে পণ্যটির জন্য অপেক্ষা করছিলেন তা স্টকে এসেছে: {product_title}। দেখুন: {product_url} — {brand_name}",
    bodyEn: "The item you were waiting for is back: {product_title}. Check it out: {product_url} — {brand_name}",
  },
  // Milestone 16 (§16 M16) — gift cards and referrals.
  gift_card_received: {
    subjectBn: "{sender_name} আপনাকে {gift_card_amount} এর গিফট কার্ড পাঠিয়েছেন",
    subjectEn: "{sender_name} sent you a {gift_card_amount} gift card",
    bodyBn: "{recipient_name}, {sender_name} আপনাকে {brand_name} এর {gift_card_amount} গিফট কার্ড পাঠিয়েছেন। কোড: {gift_card_code} (মেয়াদ: {gift_card_expires})। {gift_message} কেনাকাটা করুন: {shop_url}",
    bodyEn: "{recipient_name}, {sender_name} sent you a {gift_card_amount} {brand_name} gift card. Code: {gift_card_code} (valid until {gift_card_expires}). {gift_message} Shop: {shop_url}",
  },
  gift_card_purchased: {
    subjectBn: "আপনার গিফট কার্ড পাঠানো হয়েছে",
    subjectEn: "Your gift card has been sent",
    bodyBn: "{customer_name}, আপনার {gift_card_amount} গিফট কার্ড (••{gift_card_last4}) {recipient_name} এর কাছে পাঠানো হয়েছে। ধন্যবাদ — {brand_name}",
    bodyEn: "{customer_name}, your {gift_card_amount} gift card (••{gift_card_last4}) has been sent to {recipient_name}. Thank you — {brand_name}",
  },
  referral_reward: {
    subjectBn: "রেফারেলের পুরস্কার পেয়েছেন",
    subjectEn: "You earned a referral reward",
    bodyBn: "{customer_name}, আপনার বন্ধুর প্রথম অর্ডার সম্পন্ন হয়েছে — আপনি পেয়েছেন {reward}। ধন্যবাদ — {brand_name}",
    bodyEn: "{customer_name}, your friend's first order is complete — you earned {reward}. Thank you — {brand_name}",
  },
};

async function seedNotificationTemplates() {
  let created = 0;
  for (const event of NOTIFICATION_EVENTS) {
    const content = NOTIFICATION_TEMPLATE_CONTENT[event.key];
    if (!content) continue;
    for (const channel of NOTIFICATION_CHANNELS) {
      const existing = await prisma.messageTemplate.findUnique({
        where: { event_channel: { event: event.key as NotificationEvent, channel: channel as NotificationChannel } },
      });
      if (existing) continue;
      await prisma.messageTemplate.create({
        data: {
          event: event.key as NotificationEvent,
          channel: channel as NotificationChannel,
          isActive: true,
          subjectBn: channel === "email" ? content.subjectBn : null,
          subjectEn: channel === "email" ? content.subjectEn : null,
          bodyBn: content.bodyBn,
          bodyEn: content.bodyEn,
        },
      });
      created += 1;
    }
  }
  console.log(`[db:seed] ${created} default message templates created.`);
}

async function seedDemoBrand() {
  const overrides: [string, unknown][] = [
    ["brand.name", { bn: "ডেমো ফ্যাশন", en: "Demo Fashion" }],
    ["brand.legalName", "Demo Fashion Ltd."],
    ["brand.phone", "+8801700000000"],
    ["brand.email", "hello@demofashion.test"],
  ];
  for (const [key, value] of overrides) {
    await prisma.setting.upsert({
      where: { key },
      update: { value: value as object },
      create: { key, value: value as object },
    });
  }
  console.log('[db:seed] Demo brand settings applied ("Demo Fashion").');
}

interface DemoVariantSeed {
  sku: string;
  size: "S" | "M" | "L" | null;
  price: number;
  compareAtPrice?: number;
  onHand: number;
}

interface DemoProductSeed {
  slug: string;
  title: { bn: string; en: string };
  shortDescription: { bn: string; en: string };
  categorySlug: string;
  variants: DemoVariantSeed[];
}

const DEMO_CATEGORIES: { slug: string; name: { bn: string; en: string } }[] = [
  { slug: "panjabi", name: { bn: "পাঞ্জাবি", en: "Panjabi" } },
  { slug: "shirt", name: { bn: "শার্ট", en: "Shirt" } },
];

const DEMO_PRODUCTS: DemoProductSeed[] = [
  {
    slug: "cotton-panjabi-navy",
    title: { bn: "কটন পাঞ্জাবি নেভি", en: "Cotton Panjabi Navy" },
    shortDescription: { bn: "নরম কটন কাপড়ে তৈরি ক্লাসিক নেভি পাঞ্জাবি।", en: "A classic navy panjabi in soft cotton." },
    categorySlug: "panjabi",
    variants: [
      { sku: "PNJ-NVY-S", size: "S", price: 190000, compareAtPrice: 220000, onHand: 25 },
      { sku: "PNJ-NVY-M", size: "M", price: 190000, compareAtPrice: 220000, onHand: 40 },
      { sku: "PNJ-NVY-L", size: "L", price: 190000, compareAtPrice: 220000, onHand: 30 },
    ],
  },
  {
    slug: "cotton-panjabi-white",
    title: { bn: "কটন পাঞ্জাবি সাদা", en: "Cotton Panjabi White" },
    shortDescription: { bn: "উৎসবের জন্য উপযুক্ত সাদা পাঞ্জাবি, ফ্রি সাইজ।", en: "A free-size white panjabi for festive occasions." },
    categorySlug: "panjabi",
    variants: [{ sku: "PNJ-WHT-FS", size: null, price: 170000, onHand: 50 }],
  },
  {
    slug: "formal-shirt-sky-blue",
    title: { bn: "ফরমাল শার্ট স্কাই ব্লু", en: "Formal Shirt Sky Blue" },
    shortDescription: { bn: "অফিস ও ফরমাল অনুষ্ঠানের জন্য স্কাই ব্লু শার্ট।", en: "A sky blue shirt for the office or formal occasions." },
    categorySlug: "shirt",
    variants: [
      { sku: "SHT-SKY-S", size: "S", price: 140000, onHand: 20 },
      { sku: "SHT-SKY-M", size: "M", price: 140000, onHand: 35 },
      { sku: "SHT-SKY-L", size: "L", price: 140000, onHand: 15 },
    ],
  },
  {
    slug: "casual-shirt-checked",
    title: { bn: "ক্যাজুয়াল চেকড শার্ট", en: "Casual Shirt Checked" },
    shortDescription: { bn: "প্রতিদিনের জন্য আরামদায়ক চেকড শার্ট।", en: "A comfortable checked shirt for everyday wear." },
    categorySlug: "shirt",
    // Deliberately low stock — exercises the low-stock dashboard alert (M8) and the storefront's near-sold-out messaging.
    variants: [{ sku: "SHT-CHK-FS", size: null, price: 120000, onHand: 2 }],
  },
];

async function seedDemoCatalog() {
  const location = await prisma.stockLocation.findFirst({ where: { isDefault: true } });
  if (!location) throw new Error('No default stock location — run the base seed (seedDefaultStockLocation) first.');

  const categoryIdBySlug = new Map<string, string>();
  for (const category of DEMO_CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: { slug: category.slug, name: category.name, isActive: true },
    });
    categoryIdBySlug.set(category.slug, row.id);
  }

  let created = 0;
  for (const demo of DEMO_PRODUCTS) {
    const existing = await prisma.product.findUnique({ where: { slug: demo.slug } });
    if (existing) continue;

    const categoryId = categoryIdBySlug.get(demo.categorySlug);
    const hasSizes = demo.variants.some((v) => v.size !== null);

    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          slug: demo.slug,
          title: demo.title,
          shortDescription: demo.shortDescription,
          categoryId,
          status: "active",
          publishedAt: new Date(),
          requiresShipping: true,
        },
      });

      let sizeOptionValueBySize: Map<string, string> | null = null;
      if (hasSizes) {
        const option = await tx.productOption.create({
          data: { productId: product.id, name: { bn: "সাইজ", en: "Size" }, type: "size" },
        });
        const sizes: ("S" | "M" | "L")[] = ["S", "M", "L"];
        const entries = await Promise.all(
          sizes.map(async (size, position) => {
            const value = await tx.productOptionValue.create({ data: { productOptionId: option.id, value: { bn: size, en: size }, position } });
            return [size, value.id] as const;
          }),
        );
        sizeOptionValueBySize = new Map(entries);
      }

      for (const variant of demo.variants) {
        const optionValueIds = variant.size && sizeOptionValueBySize ? [sizeOptionValueBySize.get(variant.size)!] : [];
        const createdVariant = await tx.productVariant.create({
          data: {
            productId: product.id,
            sku: variant.sku,
            optionValueIds,
            price: variant.price,
            compareAtPrice: variant.compareAtPrice,
            weightGrams: 400,
          },
        });
        await tx.inventoryLevel.create({ data: { variantId: createdVariant.id, locationId: location.id, onHand: variant.onHand } });
      }
    });
    created += 1;
  }
  console.log(`[db:seed] ${created} demo products created (categories: ${DEMO_CATEGORIES.map((c) => c.slug).join(", ")}).`);
}

async function main() {
  await seedSuperAdminRole();
  await seedUiStrings();
  await seedLocations();
  await seedDefaultStockLocation();
  await seedDefaultReturnReasons();
  await seedDefaultPages();
  await seedNotificationTemplates();
  if (isDemo) {
    await seedDemoBrand();
    await seedDemoCatalog();
  }
  console.log(`[db:seed] Done (${isDemo ? "base + demo" : "base"}).`);
}

main()
  .catch((error) => {
    console.error("[db:seed] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
