-- Milestone 4 (docs/PROJECT_SPEC.md §16 M4) — storefront catalog
-- experience: notify-me requests, first-party analytics events.
-- Hand-written, same reason as every prior milestone's migration: no live
-- Postgres/shadow DB available in this environment.

-- CreateEnum
CREATE TYPE "NotifyMeChannel" AS ENUM ('sms', 'email');

-- CreateEnum
CREATE TYPE "NotifyMeStatus" AS ENUM ('pending', 'notified', 'cancelled');

-- CreateTable
CREATE TABLE "notify_me_requests" (
    "id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "channel" "NotifyMeChannel" NOT NULL,
    "status" "NotifyMeStatus" NOT NULL DEFAULT 'pending',
    "notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notify_me_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "anonymous_id" TEXT,
    "path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notify_me_requests_variant_id_status_idx" ON "notify_me_requests"("variant_id", "status");

-- CreateIndex
CREATE INDEX "analytics_events_type_created_at_idx" ON "analytics_events"("type", "created_at");

-- AddForeignKey
ALTER TABLE "notify_me_requests" ADD CONSTRAINT "notify_me_requests_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
