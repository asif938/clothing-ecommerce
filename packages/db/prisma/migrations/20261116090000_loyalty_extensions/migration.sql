-- CreateEnum
CREATE TYPE "StoreCreditReason" AS ENUM ('refund', 'return', 'gift_card', 'referral', 'cashback', 'adjust', 'order_payment', 'order_reversal');

-- CreateEnum
CREATE TYPE "GiftCardStatus" AS ENUM ('pending', 'active', 'disabled', 'redeemed', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "GiftCardSource" AS ENUM ('admin', 'purchase');

-- CreateEnum
CREATE TYPE "GiftCardTransactionReason" AS ENUM ('issue', 'redeem', 'reversal', 'adjust', 'wallet_transfer', 'expire');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('pending', 'rewarded', 'void');

-- CreateEnum
CREATE TYPE "AffiliateStatus" AS ENUM ('active', 'paused');

-- CreateEnum
CREATE TYPE "AffiliateCommissionType" AS ENUM ('percent', 'fixed');

-- CreateEnum
CREATE TYPE "AffiliateConversionStatus" AS ENUM ('pending', 'approved', 'rejected', 'paid');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationEvent" ADD VALUE 'gift_card_received';
ALTER TYPE "NotificationEvent" ADD VALUE 'gift_card_purchased';
ALTER TYPE "NotificationEvent" ADD VALUE 'referral_reward';

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'gift_card';

-- AlterTable
ALTER TABLE "carts" ADD COLUMN     "affiliate_clicked_at" TIMESTAMP(3),
ADD COLUMN     "affiliate_code" TEXT,
ADD COLUMN     "gift_card_id" TEXT,
ADD COLUMN     "referral_code" TEXT,
ADD COLUMN     "use_store_credit" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "gift_card_id" TEXT,
ADD COLUMN     "gift_card_used" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "referral_discount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "store_credit_used" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "store_credit_transactions" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "StoreCreditReason" NOT NULL,
    "reference" TEXT,
    "order_id" TEXT,
    "balance_after" INTEGER NOT NULL,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_cards" (
    "id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "initial_amount" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "status" "GiftCardStatus" NOT NULL DEFAULT 'active',
    "source" "GiftCardSource" NOT NULL DEFAULT 'admin',
    "expires_at" TIMESTAMP(3),
    "purchaser_customer_id" TEXT,
    "purchaser_name" TEXT,
    "purchaser_phone" TEXT,
    "purchaser_email" TEXT,
    "recipient_name" TEXT,
    "recipient_phone" TEXT,
    "recipient_email" TEXT,
    "message" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'bn',
    "delivered_at" TIMESTAMP(3),
    "payment_method" TEXT,
    "provider_instance_id" TEXT,
    "payment_external_ref" TEXT,
    "paid_at" TIMESTAMP(3),
    "payment_timeout_at" TIMESTAMP(3),
    "purchase_token" TEXT,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gift_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_card_transactions" (
    "id" TEXT NOT NULL,
    "gift_card_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "GiftCardTransactionReason" NOT NULL,
    "reference" TEXT,
    "order_id" TEXT,
    "balance_after" INTEGER NOT NULL,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_card_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "referrer_customer_id" TEXT NOT NULL,
    "referee_customer_id" TEXT,
    "referee_phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'pending',
    "referee_discount" INTEGER NOT NULL DEFAULT 0,
    "reward_type" TEXT,
    "reward_amount" INTEGER,
    "rewarded_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "discount_id" TEXT,
    "commission_type" "AffiliateCommissionType" NOT NULL DEFAULT 'percent',
    "commission_value" INTEGER NOT NULL,
    "attribution_days" INTEGER,
    "status" "AffiliateStatus" NOT NULL DEFAULT 'active',
    "payout_method" TEXT,
    "payout_details" TEXT,
    "notes" TEXT,
    "portal_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_click_days" (
    "affiliate_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "affiliate_click_days_pkey" PRIMARY KEY ("affiliate_id","day")
);

-- CreateTable
CREATE TABLE "affiliate_conversions" (
    "id" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "order_amount" INTEGER NOT NULL,
    "commission" INTEGER NOT NULL,
    "status" "AffiliateConversionStatus" NOT NULL DEFAULT 'pending',
    "approved_at" TIMESTAMP(3),
    "rejected_reason" TEXT,
    "payout_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_payouts" (
    "id" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "external_ref" TEXT,
    "note" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_credit_transactions_customer_id_created_at_idx" ON "store_credit_transactions"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "store_credit_transactions_order_id_idx" ON "store_credit_transactions"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_credit_transactions_reason_reference_key" ON "store_credit_transactions"("reason", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "gift_cards_code_hash_key" ON "gift_cards"("code_hash");

-- CreateIndex
CREATE UNIQUE INDEX "gift_cards_purchase_token_key" ON "gift_cards"("purchase_token");

-- CreateIndex
CREATE INDEX "gift_cards_status_created_at_idx" ON "gift_cards"("status", "created_at");

-- CreateIndex
CREATE INDEX "gift_cards_payment_external_ref_idx" ON "gift_cards"("payment_external_ref");

-- CreateIndex
CREATE INDEX "gift_cards_last4_idx" ON "gift_cards"("last4");

-- CreateIndex
CREATE INDEX "gift_card_transactions_gift_card_id_created_at_idx" ON "gift_card_transactions"("gift_card_id", "created_at");

-- CreateIndex
CREATE INDEX "gift_card_transactions_order_id_idx" ON "gift_card_transactions"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "gift_card_transactions_reason_reference_key" ON "gift_card_transactions"("reason", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referee_phone_key" ON "referrals"("referee_phone");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_order_id_key" ON "referrals"("order_id");

-- CreateIndex
CREATE INDEX "referrals_referrer_customer_id_created_at_idx" ON "referrals"("referrer_customer_id", "created_at");

-- CreateIndex
CREATE INDEX "referrals_status_idx" ON "referrals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "affiliates_code_key" ON "affiliates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "affiliates_discount_id_key" ON "affiliates"("discount_id");

-- CreateIndex
CREATE UNIQUE INDEX "affiliates_portal_token_key" ON "affiliates"("portal_token");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_conversions_order_id_key" ON "affiliate_conversions"("order_id");

-- CreateIndex
CREATE INDEX "affiliate_conversions_affiliate_id_status_idx" ON "affiliate_conversions"("affiliate_id", "status");

-- CreateIndex
CREATE INDEX "affiliate_conversions_status_created_at_idx" ON "affiliate_conversions"("status", "created_at");

-- CreateIndex
CREATE INDEX "affiliate_payouts_affiliate_id_created_at_idx" ON "affiliate_payouts"("affiliate_id", "created_at");

-- AddForeignKey
ALTER TABLE "store_credit_transactions" ADD CONSTRAINT "store_credit_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_purchaser_customer_id_fkey" FOREIGN KEY ("purchaser_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_card_transactions" ADD CONSTRAINT "gift_card_transactions_gift_card_id_fkey" FOREIGN KEY ("gift_card_id") REFERENCES "gift_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_customer_id_fkey" FOREIGN KEY ("referrer_customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_customer_id_fkey" FOREIGN KEY ("referee_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_click_days" ADD CONSTRAINT "affiliate_click_days_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_conversions" ADD CONSTRAINT "affiliate_conversions_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_conversions" ADD CONSTRAINT "affiliate_conversions_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "affiliate_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

