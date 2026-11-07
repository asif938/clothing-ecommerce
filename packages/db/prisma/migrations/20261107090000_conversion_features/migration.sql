-- CreateEnum
CREATE TYPE "BundleDiscountType" AS ENUM ('none', 'percent', 'fixed_price');

-- AlterEnum
ALTER TYPE "NotificationChannel" ADD VALUE 'push';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationEvent" ADD VALUE 'abandoned_cart_1';
ALTER TYPE "NotificationEvent" ADD VALUE 'abandoned_cart_2';
ALTER TYPE "NotificationEvent" ADD VALUE 'abandoned_cart_3';
ALTER TYPE "NotificationEvent" ADD VALUE 'back_in_stock';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "bundle_discount_type" "BundleDiscountType" NOT NULL DEFAULT 'none',
ADD COLUMN     "bundle_discount_value" INTEGER,
ADD COLUMN     "preorder_limit" INTEGER,
ADD COLUMN     "preorder_release_date" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "carts" ADD COLUMN     "abandoned_at" TIMESTAMP(3),
ADD COLUMN     "recovered_at" TIMESTAMP(3),
ADD COLUMN     "recovery_sequence_step" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "customer_measurements" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "unit" "LengthUnit" NOT NULL DEFAULT 'cm',
    "height_cm" DOUBLE PRECISION,
    "weight_kg" DOUBLE PRECISION,
    "chest_cm" DOUBLE PRECISION,
    "waist_cm" DOUBLE PRECISION,
    "hip_cm" DOUBLE PRECISION,
    "inseam_cm" DOUBLE PRECISION,
    "preferred_fit" TEXT NOT NULL DEFAULT 'regular',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bundle_items" (
    "id" TEXT NOT NULL,
    "bundle_product_id" TEXT NOT NULL,
    "component_product_id" TEXT NOT NULL,
    "component_variant_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bundle_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'bn',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sent_at" TIMESTAMP(3),

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_posts" (
    "id" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" JSONB,
    "cover_media_id" TEXT,
    "blocks_draft" JSONB NOT NULL,
    "blocks_published" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PageStatus" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMP(3),
    "seo_title" JSONB,
    "seo_description" JSONB,
    "author_staff_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_measurements_customer_id_key" ON "customer_measurements"("customer_id");

-- CreateIndex
CREATE INDEX "bundle_items_bundle_product_id_idx" ON "bundle_items"("bundle_product_id");

-- CreateIndex
CREATE INDEX "bundle_items_component_variant_id_idx" ON "bundle_items"("component_variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_customer_id_idx" ON "push_subscriptions"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "blog_posts_slug_key" ON "blog_posts"("slug");

-- CreateIndex
CREATE INDEX "blog_posts_status_idx" ON "blog_posts"("status");

-- CreateIndex
CREATE INDEX "carts_status_last_activity_at_idx" ON "carts"("status", "last_activity_at");

-- AddForeignKey
ALTER TABLE "customer_measurements" ADD CONSTRAINT "customer_measurements_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_bundle_product_id_fkey" FOREIGN KEY ("bundle_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_component_product_id_fkey" FOREIGN KEY ("component_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_component_variant_id_fkey" FOREIGN KEY ("component_variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

