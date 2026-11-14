-- §8.2 catalog import: column mapping, saved mapping presets, and images
-- extracted from a ZIP upload (held per job until it finishes). Generated with
-- `prisma migrate diff` against the previous committed schema (no live/shadow DB).

-- AlterTable
ALTER TABLE "catalog_import_jobs" ADD COLUMN     "mapping" JSONB,
ADD COLUMN     "options" JSONB,
ADD COLUMN     "warning_rows" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "catalog_import_files" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_import_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_import_presets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "options" JSONB,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_import_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "catalog_import_files_job_id_name_key" ON "catalog_import_files"("job_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_import_presets_name_key" ON "catalog_import_presets"("name");

-- AddForeignKey
ALTER TABLE "catalog_import_files" ADD CONSTRAINT "catalog_import_files_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "catalog_import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

