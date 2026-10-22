-- Cloudinary optional media provider (change request 2026-10-22). Fully
-- non-destructive: new nullable/defaulted columns on an existing table, a
-- new enum, a new table. Existing rows (local/s3-backed media) are
-- unaffected — "resource_type" defaults to 'image' for them and
-- "provider_instance_id"/"external_id"/"version" stay NULL.

-- AlterTable
ALTER TABLE "media"
  ADD COLUMN "provider_instance_id" TEXT,
  ADD COLUMN "external_id" TEXT,
  ADD COLUMN "resource_type" TEXT NOT NULL DEFAULT 'image',
  ADD COLUMN "version" INTEGER;

-- CreateIndex
CREATE INDEX "media_provider_instance_id_idx" ON "media"("provider_instance_id");

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_provider_instance_id_fkey" FOREIGN KEY ("provider_instance_id") REFERENCES "provider_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "MediaMigrationJobStatus" AS ENUM ('pending', 'running', 'done', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "media_migration_jobs" (
    "id" TEXT NOT NULL,
    "to_provider" TEXT NOT NULL,
    "dry_run" BOOLEAN NOT NULL DEFAULT false,
    "status" "MediaMigrationJobStatus" NOT NULL DEFAULT 'pending',
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "cursor" TEXT,
    "last_error" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "media_migration_jobs_pkey" PRIMARY KEY ("id")
);
