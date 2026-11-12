-- CreateEnum
CREATE TYPE "PurchaseOrderType" AS ENUM ('purchase', 'production');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('draft', 'sent', 'partially_received', 'received', 'cancelled');

-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('draft', 'in_transit', 'received', 'cancelled');

-- CreateEnum
CREATE TYPE "StockTakeStatus" AS ENUM ('counting', 'applied', 'cancelled');

-- CreateEnum
CREATE TYPE "CodSettlementStatus" AS ENUM ('draft', 'confirmed');

-- CreateEnum
CREATE TYPE "ReportFrequency" AS ENUM ('daily', 'weekly', 'monthly');

-- CreateEnum
CREATE TYPE "AnomalySeverity" AS ENUM ('warning', 'critical');

-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "cod_settled_amount" INTEGER,
ADD COLUMN     "cod_settled_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "type" "PurchaseOrderType" NOT NULL DEFAULT 'purchase',
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'draft',
    "location_id" TEXT NOT NULL,
    "expected_at" TIMESTAMP(3),
    "notes" TEXT,
    "total_cost" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "sent_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "qty_ordered" INTEGER NOT NULL,
    "qty_received" INTEGER NOT NULL DEFAULT 0,
    "unit_cost" INTEGER NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "from_location_id" TEXT NOT NULL,
    "to_location_id" TEXT NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'draft',
    "note" TEXT,
    "created_by" TEXT,
    "shipped_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_items" (
    "id" TEXT NOT NULL,
    "transfer_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "quantity_received" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_takes" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "status" "StockTakeStatus" NOT NULL DEFAULT 'counting',
    "note" TEXT,
    "created_by" TEXT,
    "applied_by" TEXT,
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_takes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_take_lines" (
    "id" TEXT NOT NULL,
    "stock_take_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "expected_qty" INTEGER NOT NULL,
    "counted_qty" INTEGER,
    "counted_at" TIMESTAMP(3),

    CONSTRAINT "stock_take_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cod_settlements" (
    "id" TEXT NOT NULL,
    "courier_provider_instance_id" TEXT,
    "courier_driver" TEXT NOT NULL,
    "settlement_ref" TEXT,
    "period_from" TIMESTAMP(3),
    "period_to" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "file_name" TEXT,
    "total_collected" INTEGER NOT NULL DEFAULT 0,
    "total_charges" INTEGER NOT NULL DEFAULT 0,
    "net_amount" INTEGER NOT NULL DEFAULT 0,
    "received_amount" INTEGER,
    "received_at" TIMESTAMP(3),
    "status" "CodSettlementStatus" NOT NULL DEFAULT 'draft',
    "note" TEXT,
    "created_by" TEXT,
    "confirmed_by" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cod_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cod_settlement_lines" (
    "id" TEXT NOT NULL,
    "settlement_id" TEXT NOT NULL,
    "shipment_id" TEXT,
    "consignment_id" TEXT NOT NULL,
    "collected" INTEGER NOT NULL,
    "charge" INTEGER NOT NULL DEFAULT 0,
    "expected" INTEGER,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "variance" INTEGER NOT NULL DEFAULT 0,
    "flag" TEXT,
    "note" TEXT,

    CONSTRAINT "cod_settlement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_settlements" (
    "id" TEXT NOT NULL,
    "provider_instance_id" TEXT,
    "method" "PaymentMethod" NOT NULL,
    "settlement_ref" TEXT,
    "period_from" TIMESTAMP(3) NOT NULL,
    "period_to" TIMESTAMP(3) NOT NULL,
    "gross" INTEGER NOT NULL,
    "fees" INTEGER NOT NULL,
    "net" INTEGER NOT NULL,
    "expected_gross" INTEGER NOT NULL DEFAULT 0,
    "received_at" TIMESTAMP(3),
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gateway_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_reports" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "report_key" TEXT NOT NULL,
    "frequency" "ReportFrequency" NOT NULL,
    "recipients" TEXT[],
    "locale" TEXT NOT NULL DEFAULT 'bn',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "next_run_at" TIMESTAMP(3) NOT NULL,
    "last_sent_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomaly_alerts" (
    "id" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "severity" "AnomalySeverity" NOT NULL,
    "observed" DOUBLE PRECISION NOT NULL,
    "expected" DOUBLE PRECISION NOT NULL,
    "message" JSONB NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "acknowledged_by" TEXT,
    "acknowledged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anomaly_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_layouts" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "widgets" JSONB NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_number_key" ON "purchase_orders"("number");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_orders_supplier_id_idx" ON "purchase_orders"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_items_purchase_order_id_variant_id_key" ON "purchase_order_items"("purchase_order_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_number_key" ON "stock_transfers"("number");

-- CreateIndex
CREATE INDEX "stock_transfers_status_idx" ON "stock_transfers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_items_transfer_id_variant_id_key" ON "stock_transfer_items"("transfer_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_takes_number_key" ON "stock_takes"("number");

-- CreateIndex
CREATE INDEX "stock_takes_status_idx" ON "stock_takes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "stock_take_lines_stock_take_id_variant_id_key" ON "stock_take_lines"("stock_take_id", "variant_id");

-- CreateIndex
CREATE INDEX "cod_settlements_status_idx" ON "cod_settlements"("status");

-- CreateIndex
CREATE UNIQUE INDEX "cod_settlements_courier_driver_settlement_ref_key" ON "cod_settlements"("courier_driver", "settlement_ref");

-- CreateIndex
CREATE INDEX "cod_settlement_lines_settlement_id_idx" ON "cod_settlement_lines"("settlement_id");

-- CreateIndex
CREATE INDEX "cod_settlement_lines_shipment_id_idx" ON "cod_settlement_lines"("shipment_id");

-- CreateIndex
CREATE INDEX "cod_settlement_lines_consignment_id_idx" ON "cod_settlement_lines"("consignment_id");

-- CreateIndex
CREATE INDEX "gateway_settlements_period_from_period_to_idx" ON "gateway_settlements"("period_from", "period_to");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_settlements_method_settlement_ref_key" ON "gateway_settlements"("method", "settlement_ref");

-- CreateIndex
CREATE INDEX "scheduled_reports_is_active_next_run_at_idx" ON "scheduled_reports"("is_active", "next_run_at");

-- CreateIndex
CREATE UNIQUE INDEX "anomaly_alerts_dedupe_key_key" ON "anomaly_alerts"("dedupe_key");

-- CreateIndex
CREATE INDEX "anomaly_alerts_acknowledged_at_created_at_idx" ON "anomaly_alerts"("acknowledged_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_layouts_scope_scope_id_key" ON "dashboard_layouts"("scope", "scope_id");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_takes" ADD CONSTRAINT "stock_takes_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_take_lines" ADD CONSTRAINT "stock_take_lines_stock_take_id_fkey" FOREIGN KEY ("stock_take_id") REFERENCES "stock_takes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_take_lines" ADD CONSTRAINT "stock_take_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cod_settlement_lines" ADD CONSTRAINT "cod_settlement_lines_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "cod_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cod_settlement_lines" ADD CONSTRAINT "cod_settlement_lines_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

