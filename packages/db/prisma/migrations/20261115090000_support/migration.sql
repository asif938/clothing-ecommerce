-- CreateEnum
CREATE TYPE "ConversationChannel" AS ENUM ('live_chat', 'whatsapp', 'messenger', 'instagram');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('open', 'waiting_agent', 'pending', 'resolved');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound', 'internal');

-- CreateEnum
CREATE TYPE "MessageAuthorType" AS ENUM ('customer', 'staff', 'bot', 'system');

-- CreateEnum
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('received', 'queued', 'sent', 'delivered', 'read', 'failed');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('general', 'order_issue', 'delivery', 'return_exchange', 'payment', 'product', 'complaint');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('open', 'pending', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('initiated', 'ringing', 'answered', 'completed', 'no_answer', 'busy', 'failed');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('received', 'processed', 'failed', 'rejected');

-- AlterTable
ALTER TABLE "staff_users" ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "channel" "ConversationChannel" NOT NULL,
    "provider_instance_id" TEXT,
    "contact_id" TEXT NOT NULL,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "customer_id" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'open',
    "assigned_to" TEXT,
    "bot_active" BOOLEAN NOT NULL DEFAULT false,
    "handoff_reason" TEXT,
    "bot_pending_since" TIMESTAMP(3),
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_inbound_at" TIMESTAMP(3),
    "last_message_preview" TEXT,
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "order_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "author_type" "MessageAuthorType" NOT NULL,
    "staff_id" TEXT,
    "body" TEXT NOT NULL,
    "attachments" JSONB,
    "external_id" TEXT,
    "delivery_status" "MessageDeliveryStatus" NOT NULL DEFAULT 'received',
    "error" TEXT,
    "tool_trace" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "type" "TicketType" NOT NULL DEFAULT 'general',
    "priority" "TicketPriority" NOT NULL DEFAULT 'normal',
    "status" "TicketStatus" NOT NULL DEFAULT 'open',
    "customer_id" TEXT,
    "order_id" TEXT,
    "conversation_id" TEXT,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "assigned_to" TEXT,
    "first_response_due_at" TIMESTAMP(3) NOT NULL,
    "first_response_at" TIMESTAMP(3),
    "resolution_due_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "first_response_breached_at" TIMESTAMP(3),
    "resolution_breached_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_messages" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "author_type" "MessageAuthorType" NOT NULL,
    "staff_id" TEXT,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canned_replies" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortcut" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "category" TEXT,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canned_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_logs" (
    "id" TEXT NOT NULL,
    "provider_instance_id" TEXT,
    "driver" TEXT NOT NULL,
    "staff_id" TEXT,
    "customer_id" TEXT,
    "order_id" TEXT,
    "conversation_id" TEXT,
    "phone" TEXT NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'initiated',
    "external_id" TEXT,
    "duration_seconds" INTEGER,
    "recording_url" TEXT,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "driver" TEXT NOT NULL,
    "provider_instance_id" TEXT,
    "payload" JSONB NOT NULL,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'received',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversations_status_last_message_at_idx" ON "conversations"("status", "last_message_at");

-- CreateIndex
CREATE INDEX "conversations_assigned_to_idx" ON "conversations"("assigned_to");

-- CreateIndex
CREATE INDEX "conversations_customer_id_idx" ON "conversations"("customer_id");

-- CreateIndex
CREATE INDEX "conversations_bot_pending_since_idx" ON "conversations"("bot_pending_since");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_channel_contact_id_key" ON "conversations"("channel", "contact_id");

-- CreateIndex
CREATE INDEX "conversation_messages_conversation_id_created_at_idx" ON "conversation_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "conversation_messages_external_id_idx" ON "conversation_messages"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_messages_conversation_id_external_id_key" ON "conversation_messages"("conversation_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_number_key" ON "tickets"("number");

-- CreateIndex
CREATE INDEX "tickets_status_resolution_due_at_idx" ON "tickets"("status", "resolution_due_at");

-- CreateIndex
CREATE INDEX "tickets_assigned_to_status_idx" ON "tickets"("assigned_to", "status");

-- CreateIndex
CREATE INDEX "tickets_customer_id_idx" ON "tickets"("customer_id");

-- CreateIndex
CREATE INDEX "tickets_order_id_idx" ON "tickets"("order_id");

-- CreateIndex
CREATE INDEX "ticket_messages_ticket_id_created_at_idx" ON "ticket_messages"("ticket_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "canned_replies_shortcut_key" ON "canned_replies"("shortcut");

-- CreateIndex
CREATE INDEX "call_logs_staff_id_started_at_idx" ON "call_logs"("staff_id", "started_at");

-- CreateIndex
CREATE INDEX "call_logs_order_id_idx" ON "call_logs"("order_id");

-- CreateIndex
CREATE INDEX "call_logs_external_id_idx" ON "call_logs"("external_id");

-- CreateIndex
CREATE INDEX "webhook_events_status_received_at_idx" ON "webhook_events"("status", "received_at");

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

