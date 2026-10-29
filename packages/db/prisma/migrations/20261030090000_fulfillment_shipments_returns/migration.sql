-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('pending', 'booked', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'partially_delivered', 'returned_to_sender', 'rejected_at_door', 'cancelled', 'lost');

-- CreateEnum
CREATE TYPE "RefundMethod" AS ENUM ('original', 'bkash_manual', 'nagad_manual', 'bank', 'store_credit');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('pending', 'processing', 'completed', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "ReturnShippingPaidBy" AS ENUM ('customer', 'brand');

-- CreateEnum
CREATE TYPE "ReturnType" AS ENUM ('refund', 'exchange', 'store_credit');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('requested', 'approved', 'rejected', 'pickup_scheduled', 'received', 'inspected', 'completed', 'cancelled');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderEventType" ADD VALUE 'assigned';
ALTER TYPE "OrderEventType" ADD VALUE 'tag';
ALTER TYPE "OrderEventType" ADD VALUE 'return';
ALTER TYPE "OrderEventType" ADD VALUE 'refund';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "delivered_at" TIMESTAMP(3),
ADD COLUMN     "possible_duplicate_order_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "total_weight_grams" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "courier_provider_instance_id" TEXT,
    "courier_driver" TEXT NOT NULL,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "consignment_id" TEXT,
    "tracking_code" TEXT,
    "tracking_url" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'pending',
    "raw_status" TEXT,
    "cod_amount" INTEGER NOT NULL DEFAULT 0,
    "weight_grams" INTEGER NOT NULL,
    "delivery_charge_actual" INTEGER,
    "delivery_fee_collected" INTEGER,
    "booked_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "handed_over_at" TIMESTAMP(3),
    "last_polled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_items" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "shipment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_events" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL,
    "raw_status" TEXT,
    "message" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "payment_id" TEXT,
    "return_id" TEXT,
    "amount" INTEGER NOT NULL,
    "method" "RefundMethod" NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "approved_by" TEXT,
    "external_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_reasons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" JSONB NOT NULL,
    "default_paid_by" "ReturnShippingPaidBy" NOT NULL DEFAULT 'customer',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "return_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "returns" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "type" "ReturnType" NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'requested',
    "reason_code" TEXT,
    "customer_comment" TEXT,
    "media_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "items" JSONB NOT NULL,
    "return_shipping_paid_by" "ReturnShippingPaidBy",
    "resolution" JSONB,
    "exchange_order_id" TEXT,
    "rejected_reason" TEXT,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_area_mappings" (
    "id" TEXT NOT NULL,
    "courier_provider_instance_id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "district_id" TEXT NOT NULL,
    "area_id" TEXT,
    "courier_area_code" TEXT NOT NULL,
    "courier_area_name" TEXT,
    "extra" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courier_area_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shipments_order_id_idx" ON "shipments"("order_id");

-- CreateIndex
CREATE INDEX "shipments_status_idx" ON "shipments"("status");

-- CreateIndex
CREATE INDEX "shipments_consignment_id_idx" ON "shipments"("consignment_id");

-- CreateIndex
CREATE INDEX "shipment_items_shipment_id_idx" ON "shipment_items"("shipment_id");

-- CreateIndex
CREATE INDEX "shipment_events_shipment_id_occurred_at_idx" ON "shipment_events"("shipment_id", "occurred_at");

-- CreateIndex
CREATE INDEX "refunds_order_id_idx" ON "refunds"("order_id");

-- CreateIndex
CREATE INDEX "refunds_status_idx" ON "refunds"("status");

-- CreateIndex
CREATE UNIQUE INDEX "return_reasons_code_key" ON "return_reasons"("code");

-- CreateIndex
CREATE INDEX "returns_order_id_idx" ON "returns"("order_id");

-- CreateIndex
CREATE INDEX "returns_status_idx" ON "returns"("status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_order_id_key" ON "invoices"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE UNIQUE INDEX "courier_area_mappings_courier_provider_instance_id_division_key" ON "courier_area_mappings"("courier_provider_instance_id", "division_id", "district_id", "area_id");

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

