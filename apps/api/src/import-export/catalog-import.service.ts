import { BadRequestException, Injectable, Logger, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { slugify, uniqueSlug } from "@clothing/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SchedulerService } from "../queue/scheduler.service";
import { InventoryService } from "../inventory/inventory.service";
import type { AuthenticatedStaff } from "../common/types";
import { parseWorkbookRows, rowsToCsv } from "./workbook";
import { validateImportRow, type ImportRow, type RowValidationError } from "./row-schema";

const TASK_TYPE = "catalog_import.tick";
const CHUNK_SIZE = 20;

interface RowOutcome {
  error: RowValidationError | null;
  created: boolean;
}

@Injectable()
export class CatalogImportService implements OnModuleInit {
  private readonly logger = new Logger(CatalogImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scheduler: SchedulerService,
    private readonly inventory: InventoryService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerHandler(TASK_TYPE, async (payload) => {
      const { jobId } = payload as { jobId: string };
      await this.processChunk(jobId);
    });
  }

  /** Dry run: parses and validates every row without touching the database (docs/PROJECT_SPEC.md §8.2 "dry-run validation report"). */
  dryRun(buffer: Buffer, fileName: string) {
    const rawRows = parseWorkbookRows(buffer, fileName);
    const errors: RowValidationError[] = [];
    let validCount = 0;
    rawRows.forEach((raw, index) => {
      const { error } = validateImportRow(raw, index + 2); // +2: 1-based, plus the header row
      if (error) errors.push(error);
      else validCount += 1;
    });
    return { totalRows: rawRows.length, validCount, errorCount: errors.length, errors: errors.slice(0, 100) };
  }

  async create(buffer: Buffer, fileName: string, actor: AuthenticatedStaff) {
    const rawRows = parseWorkbookRows(buffer, fileName);
    if (rawRows.length === 0) throw new BadRequestException({ code: "EMPTY_FILE", message: "No rows found in the uploaded file" });

    const job = await this.prisma.catalogImportJob.create({
      // Node's Buffer and Prisma's Bytes input type disagree on the exact
      // ArrayBuffer generic parameter under the current @types/node — safe,
      // since Buffer *is* a Uint8Array at runtime.
      data: { fileName, fileBytes: buffer as never, totalRows: rawRows.length, createdBy: actor.id },
    });
    await this.prisma.scheduledTask.create({ data: { type: TASK_TYPE, payload: { jobId: job.id } as object, runAt: new Date() } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "catalog_import.create", entityType: "catalog_import_job", entityId: job.id, after: { fileName, totalRows: rawRows.length } });
    return { id: job.id, status: job.status, totalRows: job.totalRows };
  }

  async get(id: string) {
    const job = await this.prisma.catalogImportJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException("Import job not found");
    const { fileBytes: _fileBytes, ...rest } = job;
    return rest;
  }

  async list() {
    const jobs = await this.prisma.catalogImportJob.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    return jobs.map(({ fileBytes: _fileBytes, ...rest }) => rest);
  }

  /** CSV of every row the job failed, for download from the job's progress UI. */
  async downloadErrorReport(id: string): Promise<string> {
    const job = await this.prisma.catalogImportJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException("Import job not found");
    const errors: RowValidationError[] = job.errorReport ? JSON.parse(job.errorReport) : [];
    return rowsToCsv(errors.map((e) => ({ row: e.row, sku: e.sku ?? "", message: e.message })));
  }

  private async resolveCategoryId(categorySlug: string | undefined): Promise<{ categoryId: string | null; error: string | null }> {
    if (!categorySlug) return { categoryId: null, error: null };
    const category = await this.prisma.category.findUnique({ where: { slug: categorySlug } });
    if (!category) return { categoryId: null, error: `Unknown categorySlug "${categorySlug}"` };
    return { categoryId: category.id, error: null };
  }

  private async resolveOptionValue(productId: string, type: "size" | "color", label: string, position: number): Promise<string> {
    let option = await this.prisma.productOption.findFirst({ where: { productId, type } });
    if (!option) {
      option = await this.prisma.productOption.create({ data: { productId, type, name: { en: type === "size" ? "Size" : "Color" }, position } });
    }
    const existingValues = await this.prisma.productOptionValue.findMany({ where: { productOptionId: option.id } });
    const match = existingValues.find((v) => {
      const value = v.value as { en?: string; bn?: string };
      return (value.en ?? "").toLowerCase() === label.toLowerCase() || (value.bn ?? "") === label;
    });
    if (match) return match.id;

    const created = await this.prisma.productOptionValue.create({ data: { productOptionId: option.id, value: { en: label }, position: existingValues.length } });
    return created.id;
  }

  private async importRow(row: ImportRow, rowNumber: number): Promise<RowOutcome> {
    const { categoryId, error: categoryError } = await this.resolveCategoryId(row.categorySlug);
    if (categoryError) return { error: { row: rowNumber, sku: row.sku, message: categoryError }, created: false };

    let product = await this.prisma.product.findUnique({ where: { slug: row.productSlug } });
    if (!product) {
      const title = { en: row.productTitleEn ?? row.productSlug, bn: row.productTitleBn };
      const slug = await uniqueSlug(slugify(row.productSlug), async (candidate) => !!(await this.prisma.product.findUnique({ where: { slug: candidate } })));
      product = await this.prisma.product.create({ data: { title, slug, categoryId, status: row.status ?? "draft", tags: row.tags ?? [] } });
    }

    const optionValueIds: string[] = [];
    if (row.optionSize) optionValueIds.push(await this.resolveOptionValue(product.id, "size", row.optionSize, 0));
    if (row.optionColor) optionValueIds.push(await this.resolveOptionValue(product.id, "color", row.optionColor, 1));

    const existingVariant = await this.prisma.productVariant.findUnique({ where: { sku: row.sku } });
    if (existingVariant && existingVariant.productId !== product.id) {
      return { error: { row: rowNumber, sku: row.sku, message: `SKU "${row.sku}" already belongs to a different product` }, created: false };
    }

    const variant = existingVariant
      ? await this.prisma.productVariant.update({
          where: { id: existingVariant.id },
          data: {
            optionValueIds,
            price: row.price,
            compareAtPrice: row.compareAtPrice ?? null,
            costPrice: row.costPrice ?? null,
            barcode: row.barcode ?? null,
            weightGrams: row.weightGrams ?? null,
          },
        })
      : await this.prisma.productVariant.create({
          data: { productId: product.id, sku: row.sku, optionValueIds, price: row.price, compareAtPrice: row.compareAtPrice ?? null, costPrice: row.costPrice ?? null, barcode: row.barcode ?? null, weightGrams: row.weightGrams ?? null },
        });

    await this.inventory.ensureLevelsForVariant(variant.id);
    if (row.onHand !== undefined) {
      const location = await this.prisma.stockLocation.findFirst({ where: { isActive: true }, orderBy: { isDefault: "desc" } });
      if (location) {
        const level = await this.prisma.inventoryLevel.findUnique({ where: { variantId_locationId: { variantId: variant.id, locationId: location.id } } });
        const delta = row.onHand - (level?.onHand ?? 0);
        if (delta !== 0) {
          await this.prisma.$transaction([
            this.prisma.stockMovement.create({ data: { variantId: variant.id, locationId: location.id, quantity: delta, reason: "purchase_receive", note: "Catalog import" } }),
            this.prisma.inventoryLevel.update({ where: { variantId_locationId: { variantId: variant.id, locationId: location.id } }, data: { onHand: row.onHand } }),
          ]);
        }
      }
    }

    return { error: null, created: !existingVariant };
  }

  private async processChunk(jobId: string): Promise<void> {
    const job = await this.prisma.catalogImportJob.findUnique({ where: { id: jobId } });
    if (!job || job.status === "done" || job.status === "cancelled" || job.status === "failed" || !job.fileBytes) return;

    if (job.status === "pending") await this.prisma.catalogImportJob.update({ where: { id: jobId }, data: { status: "running" } });

    const rawRows = parseWorkbookRows(Buffer.from(job.fileBytes), job.fileName);
    const batch = rawRows.slice(job.cursor, job.cursor + CHUNK_SIZE);

    let createdRows = job.createdRows;
    let updatedRows = job.updatedRows;
    let errorRows = job.errorRows;
    const newErrors: RowValidationError[] = [];

    for (const [offset, raw] of batch.entries()) {
      const rowNumber = job.cursor + offset + 2;
      const { row, error } = validateImportRow(raw, rowNumber);
      if (error) {
        errorRows += 1;
        newErrors.push(error);
        continue;
      }
      try {
        const outcome = await this.importRow(row, rowNumber);
        if (outcome.error) {
          errorRows += 1;
          newErrors.push(outcome.error);
        } else if (outcome.created) {
          createdRows += 1;
        } else {
          updatedRows += 1;
        }
      } catch (err) {
        errorRows += 1;
        newErrors.push({ row: rowNumber, sku: row.sku, message: err instanceof Error ? err.message : "Unknown error" });
        this.logger.error(`Import job ${jobId} row ${rowNumber} failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    const cursor = job.cursor + batch.length;
    const processedRows = job.processedRows + batch.length;
    // Accumulated as JSON while the job runs (exact, no lossy CSV round-trip
    // through a field that might itself contain commas) — `downloadErrorReport`
    // renders it to CSV on demand, once, for the admin to download.
    const allErrors: RowValidationError[] = [...(job.errorReport ? (JSON.parse(job.errorReport) as RowValidationError[]) : []), ...newErrors];
    const errorReport = JSON.stringify(allErrors);
    const hasMore = cursor < job.totalRows;

    await this.prisma.catalogImportJob.update({
      where: { id: jobId },
      data: {
        cursor,
        processedRows,
        createdRows,
        updatedRows,
        errorRows,
        errorReport,
        ...(hasMore ? {} : { status: "done", finishedAt: new Date(), fileBytes: null }),
      },
    });

    if (hasMore) {
      await this.prisma.scheduledTask.create({ data: { type: TASK_TYPE, payload: { jobId } as object, runAt: new Date() } });
    } else {
      await this.audit.record({ actorType: "system", action: "catalog_import.finish", entityType: "catalog_import_job", entityId: jobId, after: { createdRows, updatedRows, errorRows } });
    }
  }
}
