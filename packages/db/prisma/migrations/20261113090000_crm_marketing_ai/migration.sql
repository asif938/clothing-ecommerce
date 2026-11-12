-- CreateEnum
CREATE TYPE "LoyaltyReason" AS ENUM ('order_delivered', 'order_redeem', 'redeem_reversal', 'review_photo', 'birthday', 'referral', 'expire', 'adjust');

-- CreateEnum
CREATE TYPE "LoyaltyTransactionStatus" AS ENUM ('pending', 'available', 'void');

-- CreateEnum
CREATE TYPE "JourneyType" AS ENUM ('welcome', 'post_purchase', 'win_back', 'birthday');

-- CreateEnum
CREATE TYPE "JourneyEnrollmentStatus" AS ENUM ('active', 'completed', 'exited', 'failed');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed');

-- CreateEnum
CREATE TYPE "AudienceSyncStatus" AS ENUM ('idle', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "AdPlatform" AS ENUM ('meta', 'google', 'tiktok', 'other');

-- CreateEnum
CREATE TYPE "AiDraftStatus" AS ENUM ('pending', 'applied', 'discarded');

-- CreateEnum
CREATE TYPE "LinkScanStatus" AS ENUM ('running', 'completed', 'failed');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationEvent" ADD VALUE 'marketing_broadcast';
ALTER TYPE "NotificationEvent" ADD VALUE 'journey_message';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "last_order_at" TIMESTAMP(3),
ADD COLUMN     "rfm_frequency" INTEGER,
ADD COLUMN     "rfm_monetary" INTEGER,
ADD COLUMN     "rfm_recency" INTEGER,
ADD COLUMN     "rfm_scored_at" TIMESTAMP(3),
ADD COLUMN     "rfm_segment" TEXT,
ADD COLUMN     "tier_id" TEXT;

-- AlterTable
ALTER TABLE "carts" ADD COLUMN     "redeem_points" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "points_discount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "points_redeemed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "loyalty_tiers" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "min_spent" INTEGER NOT NULL,
    "earn_multiplier_percent" INTEGER NOT NULL DEFAULT 100,
    "perks" JSONB,
    "color" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_transactions" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" "LoyaltyReason" NOT NULL,
    "status" "LoyaltyTransactionStatus" NOT NULL DEFAULT 'available',
    "reference" TEXT,
    "order_id" TEXT,
    "remaining" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journeys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "JourneyType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "respect_consent" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "activated_at" TIMESTAMP(3),
    "enrolled_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journey_enrollments" (
    "id" TEXT NOT NULL,
    "journey_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "context_key" TEXT NOT NULL,
    "step_index" INTEGER NOT NULL DEFAULT 0,
    "status" "JourneyEnrollmentStatus" NOT NULL DEFAULT 'active',
    "next_run_at" TIMESTAMP(3),
    "last_error" TEXT,
    "order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journey_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcasts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "segment_id" TEXT,
    "subject_bn" TEXT,
    "subject_en" TEXT,
    "body_bn" TEXT NOT NULL,
    "body_en" TEXT NOT NULL,
    "discount_id" TEXT,
    "code_prefix" TEXT,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'draft',
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "recipient_estimate" INTEGER NOT NULL DEFAULT 0,
    "estimated_cost" INTEGER NOT NULL DEFAULT 0,
    "queued_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "cursor" TEXT,
    "last_error" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audience_syncs" (
    "id" TEXT NOT NULL,
    "segment_id" TEXT NOT NULL,
    "provider_instance_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "external_audience_id" TEXT,
    "auto_sync" BOOLEAN NOT NULL DEFAULT false,
    "status" "AudienceSyncStatus" NOT NULL DEFAULT 'idle',
    "last_synced_at" TIMESTAMP(3),
    "last_member_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audience_syncs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_spend" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "campaign_id" TEXT NOT NULL DEFAULT '',
    "campaign_name" TEXT NOT NULL,
    "spend" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "import_batch" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_spend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_feature_configs" (
    "id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "provider_instance_id" TEXT,
    "model" TEXT,
    "temperature" DOUBLE PRECISION,
    "effort" TEXT,
    "max_tokens" INTEGER NOT NULL DEFAULT 4000,
    "prompt_template" TEXT NOT NULL,
    "prompt_version" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "monthly_budget_cents" INTEGER,
    "monthly_token_budget" INTEGER,
    "alerted_month" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_feature_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_prompt_versions" (
    "id" TEXT NOT NULL,
    "feature_config_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "template" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "provider_instance_id" TEXT,
    "driver" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "est_cost_micro_usd" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "actor_id" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_drafts" (
    "id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "input" JSONB,
    "output" JSONB NOT NULL,
    "status" "AiDraftStatus" NOT NULL DEFAULT 'pending',
    "usage_log_id" TEXT,
    "created_by" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link_scans" (
    "id" TEXT NOT NULL,
    "status" "LinkScanStatus" NOT NULL DEFAULT 'running',
    "links_checked" INTEGER NOT NULL DEFAULT 0,
    "broken_count" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_by" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "link_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link_scan_results" (
    "id" TEXT NOT NULL,
    "scan_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "source_label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "http_status" INTEGER,

    CONSTRAINT "link_scan_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loyalty_transactions_customer_id_created_at_idx" ON "loyalty_transactions"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "loyalty_transactions_status_available_at_idx" ON "loyalty_transactions"("status", "available_at");

-- CreateIndex
CREATE INDEX "loyalty_transactions_expires_at_idx" ON "loyalty_transactions"("expires_at");

-- CreateIndex
CREATE INDEX "loyalty_transactions_order_id_idx" ON "loyalty_transactions"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_transactions_reason_reference_key" ON "loyalty_transactions"("reason", "reference");

-- CreateIndex
CREATE INDEX "journeys_type_is_active_idx" ON "journeys"("type", "is_active");

-- CreateIndex
CREATE INDEX "journey_enrollments_status_next_run_at_idx" ON "journey_enrollments"("status", "next_run_at");

-- CreateIndex
CREATE UNIQUE INDEX "journey_enrollments_journey_id_customer_id_context_key_key" ON "journey_enrollments"("journey_id", "customer_id", "context_key");

-- CreateIndex
CREATE INDEX "broadcasts_status_scheduled_at_idx" ON "broadcasts"("status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "audience_syncs_segment_id_provider_instance_id_key" ON "audience_syncs"("segment_id", "provider_instance_id");

-- CreateIndex
CREATE INDEX "ad_spend_date_idx" ON "ad_spend"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ad_spend_date_platform_campaign_id_campaign_name_key" ON "ad_spend"("date", "platform", "campaign_id", "campaign_name");

-- CreateIndex
CREATE UNIQUE INDEX "ai_feature_configs_feature_key" ON "ai_feature_configs"("feature");

-- CreateIndex
CREATE UNIQUE INDEX "ai_prompt_versions_feature_config_id_version_key" ON "ai_prompt_versions"("feature_config_id", "version");

-- CreateIndex
CREATE INDEX "ai_usage_logs_feature_created_at_idx" ON "ai_usage_logs"("feature", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_logs_created_at_idx" ON "ai_usage_logs"("created_at");

-- CreateIndex
CREATE INDEX "ai_drafts_entity_type_entity_id_status_idx" ON "ai_drafts"("entity_type", "entity_id", "status");

-- CreateIndex
CREATE INDEX "link_scan_results_scan_id_idx" ON "link_scan_results"("scan_id");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "loyalty_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey_enrollments" ADD CONSTRAINT "journey_enrollments_journey_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey_enrollments" ADD CONSTRAINT "journey_enrollments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_prompt_versions" ADD CONSTRAINT "ai_prompt_versions_feature_config_id_fkey" FOREIGN KEY ("feature_config_id") REFERENCES "ai_feature_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link_scan_results" ADD CONSTRAINT "link_scan_results_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "link_scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

