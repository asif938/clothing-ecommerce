-- Milestone 5 (docs/PROJECT_SPEC.md §16 M5, §5.5-§5.7) — customers and
-- auth, addresses, cart, shipping zones/rates, payment rules, discounts
-- (code + automatic) and basic flash sales, orders, order items/discounts/
-- events, payments. Hand-written, same reason as every prior milestone's
-- migration: no live Postgres/shadow DB available in this environment —
-- generated via `prisma migrate diff --from-schema-datamodel <pre-M5
-- schema> --to-schema-datamodel <current schema> --script`, which only
-- needs the two schema files (no DB connection), then reviewed by hand
-- before being committed as a migration.

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('active', 'blocked');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('login', 'checkout', 'change_phone');

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('active', 'converted', 'abandoned');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('code', 'automatic');

-- CreateEnum
CREATE TYPE "DiscountValueType" AS ENUM ('percent', 'fixed', 'free_shipping');

-- CreateEnum
CREATE TYPE "DiscountStatus" AS ENUM ('draft', 'active', 'scheduled', 'expired', 'disabled');

-- CreateEnum
CREATE TYPE "FlashSaleStatus" AS ENUM ('scheduled', 'active', 'ended', 'disabled');

-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('web', 'admin', 'phone', 'messenger', 'whatsapp');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending_payment', 'pending', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'partially_delivered', 'rejected_at_door', 'returned_to_sender', 'returned_to_warehouse', 'completed', 'on_hold', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "OrderPaymentStatus" AS ENUM ('unpaid', 'partially_paid', 'paid', 'partially_refunded', 'refunded');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('unfulfilled', 'partially_fulfilled', 'fulfilled', 'returned');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "OrderEventType" AS ENUM ('status_change', 'note', 'call_attempt', 'edit', 'payment', 'shipment', 'notification_sent', 'risk_flag');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cod', 'mock', 'sslcommerz', 'bkash', 'nagad', 'store_credit');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('full', 'advance', 'balance');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('initiated', 'pending', 'succeeded', 'failed', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "BlocklistEntryType" AS ENUM ('phone', 'ip', 'device', 'email', 'address_keyword');

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT,
    "email" TEXT,
    "google_id" TEXT,
    "gender" TEXT,
    "birthday" TIMESTAMP(3),
    "locale" TEXT NOT NULL DEFAULT 'bn',
    "points_balance" INTEGER NOT NULL DEFAULT 0,
    "store_credit_balance" INTEGER NOT NULL DEFAULT 0,
    "total_spent" INTEGER NOT NULL DEFAULT 0,
    "orders_count" INTEGER NOT NULL DEFAULT 0,
    "delivered_count" INTEGER NOT NULL DEFAULT 0,
    "returned_count" INTEGER NOT NULL DEFAULT 0,
    "rejected_at_door_count" INTEGER NOT NULL DEFAULT 0,
    "risk_score" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "marketing_consent_sms" BOOLEAN NOT NULL DEFAULT false,
    "marketing_consent_email" BOOLEAN NOT NULL DEFAULT false,
    "marketing_consent_whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "status" "CustomerStatus" NOT NULL DEFAULT 'active',
    "referral_code" TEXT,
    "referred_by" TEXT,
    "first_utm" JSONB,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_sessions" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "device" TEXT,
    "ip" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "label" TEXT,
    "recipient_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "alt_phone" TEXT,
    "division_id" TEXT NOT NULL,
    "district_id" TEXT NOT NULL,
    "area_id" TEXT NOT NULL,
    "address_line" TEXT NOT NULL,
    "landmark" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT,
    "anonymous_id" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'bn',
    "utm" JSONB,
    "status" "CartStatus" NOT NULL DEFAULT 'active',
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "division_id" TEXT,
    "district_id" TEXT,
    "area_id" TEXT,
    "address_line" TEXT,
    "landmark" TEXT,
    "selected_shipping_rate_id" TEXT,
    "coupon_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gift_wrap" BOOLEAN NOT NULL DEFAULT false,
    "customer_note" TEXT,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" TEXT NOT NULL,
    "cart_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "added_price" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "match_division_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "match_district_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "match_area_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "match_dhaka_city" BOOLEAN NOT NULL DEFAULT false,
    "is_catch_all" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_rates" (
    "id" TEXT NOT NULL,
    "zone_id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "base_fee" INTEGER NOT NULL,
    "included_weight_grams" INTEGER NOT NULL DEFAULT 1000,
    "extra_fee_per_step" INTEGER NOT NULL DEFAULT 0,
    "weight_step_grams" INTEGER NOT NULL DEFAULT 1000,
    "free_over_amount" INTEGER,
    "min_order" INTEGER,
    "max_order" INTEGER,
    "conditions" JSONB,
    "estimated_days_min" INTEGER NOT NULL DEFAULT 1,
    "estimated_days_max" INTEGER NOT NULL DEFAULT 3,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "stop_processing" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL,
    "code" TEXT,
    "value_type" "DiscountValueType" NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "conditions" JSONB,
    "limits" JSONB,
    "combinable_with" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "margin_guard_override" BOOLEAN NOT NULL DEFAULT false,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "status" "DiscountStatus" NOT NULL DEFAULT 'draft',
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_usages" (
    "id" TEXT NOT NULL,
    "discount_id" TEXT NOT NULL,
    "code" TEXT,
    "order_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "phone" TEXT,
    "amount" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flash_sales" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "FlashSaleStatus" NOT NULL DEFAULT 'scheduled',
    "banner_text" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flash_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flash_sale_items" (
    "id" TEXT NOT NULL,
    "flash_sale_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "sale_price" INTEGER NOT NULL,
    "stock_cap" INTEGER,
    "sold_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "flash_sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "customer_id" TEXT,
    "channel" "OrderChannel" NOT NULL DEFAULT 'web',
    "status" "OrderStatus" NOT NULL DEFAULT 'pending_payment',
    "payment_status" "OrderPaymentStatus" NOT NULL DEFAULT 'unpaid',
    "fulfillment_status" "FulfillmentStatus" NOT NULL DEFAULT 'unfulfilled',
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "subtotal" INTEGER NOT NULL,
    "discount_total" INTEGER NOT NULL DEFAULT 0,
    "shipping_fee" INTEGER NOT NULL DEFAULT 0,
    "shipping_discount" INTEGER NOT NULL DEFAULT 0,
    "advance_required" INTEGER NOT NULL DEFAULT 0,
    "advance_paid" INTEGER NOT NULL DEFAULT 0,
    "cod_amount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "paid_total" INTEGER NOT NULL DEFAULT 0,
    "refunded_total" INTEGER NOT NULL DEFAULT 0,
    "shipping_address" JSONB NOT NULL,
    "billing_contact" JSONB NOT NULL,
    "customer_note" TEXT,
    "risk_score" INTEGER NOT NULL DEFAULT 0,
    "risk_reason_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "risk_level" "RiskLevel" NOT NULL DEFAULT 'low',
    "requires_review" BOOLEAN NOT NULL DEFAULT false,
    "assigned_to" TEXT,
    "confirmed_by" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "cancelled_reason" TEXT,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "utm_content" TEXT,
    "referrer" TEXT,
    "landing_page" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "device_id" TEXT,
    "idempotency_key" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "payment_timeout_at" TIMESTAMP(3),
    "reservation_released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "sku" TEXT NOT NULL,
    "options_snapshot" JSONB NOT NULL,
    "image_url" TEXT,
    "unit_price" INTEGER NOT NULL,
    "compare_at_price" INTEGER,
    "quantity" INTEGER NOT NULL,
    "discount_allocated" INTEGER NOT NULL DEFAULT 0,
    "line_total" INTEGER NOT NULL,
    "cost_price" INTEGER,
    "fulfilled_qty" INTEGER NOT NULL DEFAULT 0,
    "returned_qty" INTEGER NOT NULL DEFAULT 0,
    "rejected_qty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_discounts" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "discount_id" TEXT,
    "code" TEXT,
    "type" "DiscountValueType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "allocation" JSONB,

    CONSTRAINT "order_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "type" "OrderEventType" NOT NULL,
    "data" JSONB NOT NULL,
    "actor" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "provider_instance_id" TEXT,
    "method" "PaymentMethod" NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'initiated',
    "external_ref" TEXT,
    "raw" JSONB,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocklist_entries" (
    "id" TEXT NOT NULL,
    "type" "BlocklistEntryType" NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocklist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_key" ON "customers"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "customers_google_id_key" ON "customers"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_referral_code_key" ON "customers"("referral_code");

-- CreateIndex
CREATE INDEX "customer_sessions_customer_id_idx" ON "customer_sessions"("customer_id");

-- CreateIndex
CREATE INDEX "otp_codes_phone_purpose_created_at_idx" ON "otp_codes"("phone", "purpose", "created_at");

-- CreateIndex
CREATE INDEX "addresses_customer_id_idx" ON "addresses"("customer_id");

-- CreateIndex
CREATE INDEX "carts_customer_id_idx" ON "carts"("customer_id");

-- CreateIndex
CREATE INDEX "carts_anonymous_id_idx" ON "carts"("anonymous_id");

-- CreateIndex
CREATE INDEX "cart_items_variant_id_idx" ON "cart_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cart_id_variant_id_key" ON "cart_items"("cart_id", "variant_id");

-- CreateIndex
CREATE INDEX "shipping_zones_is_active_priority_idx" ON "shipping_zones"("is_active", "priority");

-- CreateIndex
CREATE INDEX "shipping_rates_zone_id_is_active_position_idx" ON "shipping_rates"("zone_id", "is_active", "position");

-- CreateIndex
CREATE INDEX "payment_rules_is_active_priority_idx" ON "payment_rules"("is_active", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "discounts_code_key" ON "discounts"("code");

-- CreateIndex
CREATE INDEX "discounts_type_status_idx" ON "discounts"("type", "status");

-- CreateIndex
CREATE INDEX "discount_usages_discount_id_idx" ON "discount_usages"("discount_id");

-- CreateIndex
CREATE INDEX "discount_usages_order_id_idx" ON "discount_usages"("order_id");

-- CreateIndex
CREATE INDEX "flash_sales_status_starts_at_ends_at_idx" ON "flash_sales"("status", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "flash_sale_items_variant_id_idx" ON "flash_sale_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "flash_sale_items_flash_sale_id_variant_id_key" ON "flash_sale_items"("flash_sale_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_variant_id_idx" ON "order_items"("variant_id");

-- CreateIndex
CREATE INDEX "order_discounts_order_id_idx" ON "order_discounts"("order_id");

-- CreateIndex
CREATE INDEX "order_events_order_id_created_at_idx" ON "order_events"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_external_ref_idx" ON "payments"("external_ref");

-- CreateIndex
CREATE INDEX "blocklist_entries_type_value_idx" ON "blocklist_entries"("type", "value");

-- AddForeignKey
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "shipping_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_usages" ADD CONSTRAINT "discount_usages_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "discounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_usages" ADD CONSTRAINT "discount_usages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flash_sale_items" ADD CONSTRAINT "flash_sale_items_flash_sale_id_fkey" FOREIGN KEY ("flash_sale_id") REFERENCES "flash_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flash_sale_items" ADD CONSTRAINT "flash_sale_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_discounts" ADD CONSTRAINT "order_discounts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_discounts" ADD CONSTRAINT "order_discounts_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "discounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
