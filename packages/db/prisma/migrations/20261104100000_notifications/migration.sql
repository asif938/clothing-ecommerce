-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('sms', 'email', 'whatsapp');

-- CreateEnum
CREATE TYPE "NotificationEvent" AS ENUM ('otp_verification', 'order_placed', 'order_confirmed', 'order_shipped', 'order_out_for_delivery', 'order_delivered', 'order_partially_delivered', 'order_rejected_at_door', 'order_cancelled');

-- CreateEnum
CREATE TYPE "NotificationRecipientType" AS ENUM ('customer', 'guest');

-- CreateEnum
CREATE TYPE "NotificationLogStatus" AS ENUM ('queued', 'retrying', 'sent', 'failed');

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "subject_bn" TEXT,
    "subject_en" TEXT,
    "body_bn" TEXT NOT NULL,
    "body_en" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_channel_rules" (
    "id" TEXT NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "channels" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_channel_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "fallback_index" INTEGER NOT NULL DEFAULT 0,
    "recipient_type" "NotificationRecipientType" NOT NULL,
    "recipient_id" TEXT,
    "to" TEXT NOT NULL,
    "contacts" JSONB,
    "locale" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "NotificationLogStatus" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_attempt_at" TIMESTAMP(3),
    "last_error" TEXT,
    "provider_instance_id" TEXT,
    "driver" TEXT,
    "related_entity_type" TEXT,
    "related_entity_id" TEXT,
    "variables" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_notifications" (
    "id" TEXT NOT NULL,
    "staff_user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_event_channel_key" ON "message_templates"("event", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "notification_channel_rules_event_key" ON "notification_channel_rules"("event");

-- CreateIndex
CREATE INDEX "notification_logs_status_next_attempt_at_idx" ON "notification_logs"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "notification_logs_related_entity_type_related_entity_id_idx" ON "notification_logs"("related_entity_type", "related_entity_id");

-- CreateIndex
CREATE INDEX "staff_notifications_staff_user_id_read_at_idx" ON "staff_notifications"("staff_user_id", "read_at");

-- AddForeignKey
ALTER TABLE "staff_notifications" ADD CONSTRAINT "staff_notifications_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

