-- Milestone 3 (docs/PROJECT_SPEC.md §16 M3) — CMS core: pages, menus,
-- announcement bars, popups, redirects. Hand-written, same reason as the
-- previous two milestones' migrations: no live Postgres/shadow DB
-- available in this environment to run `prisma migrate dev`.

-- CreateEnum
CREATE TYPE "PageStatus" AS ENUM ('draft', 'scheduled', 'published');

-- CreateEnum
CREATE TYPE "PopupTrigger" AS ENUM ('immediate', 'delay', 'exit_intent');

-- CreateTable
CREATE TABLE "pages" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "PageStatus" NOT NULL DEFAULT 'draft',
    "publish_at" TIMESTAMP(3),
    "blocks_draft" JSONB NOT NULL,
    "blocks_published" JSONB,
    "seo_title" JSONB,
    "seo_description" JSONB,
    "og_image_media_id" TEXT,
    "noindex" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "needs_content" BOOLEAN NOT NULL DEFAULT false,
    "locked_by" TEXT,
    "locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_versions" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "blocks" JSONB NOT NULL,
    "seo_title" JSONB,
    "seo_description" JSONB,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menus" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_bars" (
    "id" TEXT NOT NULL,
    "message" JSONB NOT NULL,
    "link_url" TEXT,
    "link_text" JSONB,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcement_bars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "popups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "body" JSONB NOT NULL,
    "image_media_id" TEXT,
    "cta_text" JSONB,
    "cta_url" TEXT,
    "trigger" "PopupTrigger" NOT NULL DEFAULT 'delay',
    "delay_seconds" INTEGER,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "popups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redirects" (
    "id" TEXT NOT NULL,
    "from_path" TEXT NOT NULL,
    "to_path" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL DEFAULT 301,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "redirects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pages_slug_key" ON "pages"("slug");

-- CreateIndex
CREATE INDEX "pages_status_idx" ON "pages"("status");

-- CreateIndex
CREATE INDEX "page_versions_page_id_idx" ON "page_versions"("page_id");

-- CreateIndex
CREATE UNIQUE INDEX "menus_key_key" ON "menus"("key");

-- CreateIndex
CREATE UNIQUE INDEX "redirects_from_path_key" ON "redirects"("from_path");

-- AddForeignKey
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "newsletter_subscribers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "locale" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_email_key" ON "newsletter_subscribers"("email");
