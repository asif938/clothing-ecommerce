-- CreateEnum
CREATE TYPE "ProductAffinityKind" AS ENUM ('bought_together', 'viewed_together');

-- CreateEnum
CREATE TYPE "ExperimentKind" AS ENUM ('block', 'announcement', 'offer');

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('draft', 'running', 'paused', 'completed');

-- CreateEnum
CREATE TYPE "ExperimentGoal" AS ENUM ('purchase', 'add_to_cart', 'click');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "visitor_id" TEXT;

-- CreateTable
CREATE TABLE "product_affinities" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "related_product_id" TEXT NOT NULL,
    "kind" "ProductAffinityKind" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "support" INTEGER NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_affinities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_visual_features" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "vector" DOUBLE PRECISION[],
    "ai_tags" JSONB,
    "ai_tagged_at" TIMESTAMP(3),
    "error" TEXT,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_visual_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hypothesis" TEXT,
    "kind" "ExperimentKind" NOT NULL,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'draft',
    "goal" "ExperimentGoal" NOT NULL DEFAULT 'purchase',
    "traffic_percent" INTEGER NOT NULL DEFAULT 100,
    "variants" JSONB NOT NULL,
    "target" JSONB,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "winner_key" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_exposures" (
    "id" TEXT NOT NULL,
    "experiment_id" TEXT NOT NULL,
    "visitor_id" TEXT NOT NULL,
    "variant_key" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_exposures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_conversions" (
    "id" TEXT NOT NULL,
    "experiment_id" TEXT NOT NULL,
    "visitor_id" TEXT NOT NULL,
    "variant_key" TEXT NOT NULL,
    "goal" "ExperimentGoal" NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "value" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_affinities_related_product_id_idx" ON "product_affinities"("related_product_id");

-- CreateIndex
CREATE INDEX "product_affinities_kind_computed_at_idx" ON "product_affinities"("kind", "computed_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_affinities_product_id_kind_related_product_id_key" ON "product_affinities"("product_id", "kind", "related_product_id");

-- CreateIndex
CREATE INDEX "product_visual_features_media_id_idx" ON "product_visual_features"("media_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_visual_features_product_id_media_id_key" ON "product_visual_features"("product_id", "media_id");

-- CreateIndex
CREATE INDEX "experiments_status_kind_idx" ON "experiments"("status", "kind");

-- CreateIndex
CREATE INDEX "experiment_exposures_experiment_id_variant_key_idx" ON "experiment_exposures"("experiment_id", "variant_key");

-- CreateIndex
CREATE INDEX "experiment_exposures_visitor_id_idx" ON "experiment_exposures"("visitor_id");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_exposures_experiment_id_visitor_id_key" ON "experiment_exposures"("experiment_id", "visitor_id");

-- CreateIndex
CREATE INDEX "experiment_conversions_experiment_id_variant_key_goal_idx" ON "experiment_conversions"("experiment_id", "variant_key", "goal");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_conversions_experiment_id_visitor_id_goal_refere_key" ON "experiment_conversions"("experiment_id", "visitor_id", "goal", "reference");

-- CreateIndex
CREATE INDEX "orders_visitor_id_idx" ON "orders"("visitor_id");

-- AddForeignKey
ALTER TABLE "product_affinities" ADD CONSTRAINT "product_affinities_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_affinities" ADD CONSTRAINT "product_affinities_related_product_id_fkey" FOREIGN KEY ("related_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_visual_features" ADD CONSTRAINT "product_visual_features_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_visual_features" ADD CONSTRAINT "product_visual_features_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_exposures" ADD CONSTRAINT "experiment_exposures_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_conversions" ADD CONSTRAINT "experiment_conversions_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

