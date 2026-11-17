import { BadRequestException, Injectable, Logger, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { Prisma } from "@clothing/db";
import { slugify, uniqueSlug } from "@clothing/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SchedulerService } from "../queue/scheduler.service";
import { InventoryService } from "../inventory/inventory.service";
import { MediaService } from "../media/media.service";
import { MediaUsageService } from "../media/media-usage.service";
import { assertPublicHttpsUrl } from "../automation/safe-fetch";
import type { AuthenticatedStaff } from "../common/types";
import { inspectWorkbook, parseWorkbookRows, rowsToCsv } from "./workbook";
import { optionTypeForName, validateImportRow, type ImportOptionInput, type ImportRow, type LocalizedInput, type RowValidationError } from "./row-schema";
import { IMPORT_FIELDS, IMPORT_FIELD_LEVELS, sanitizeMapping, sanitizeOptions, suggestMapping, suggestOptions, type ColumnMapping, type ImportOptions } from "./mapping";
import { archiveBaseName, extractImageArchive, ImageArchiveError, isImageUrl, listArchiveImageNames, matchesSku } from "./image-archive";

const TASK_TYPE = "catalog_import.tick";
const CHUNK_SIZE = 20;
/** Image uploads (sharp resizing + storage) dominate a chunk's run time; a chunk stops early once it has handled this many. */
const IMAGES_PER_CHUNK = 12;
/** Archive images are written in batches so one INSERT never carries the whole ZIP. */
const FILE_INSERT_BATCH_BYTES = 8 * 1024 * 1024;
const URL_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const URL_IMAGE_TIMEOUT_MS = 15_000;

const MIME_BY_EXTENSION: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", gif: "image/gif" };

/** Default names for the two attributes the importer can create on its own; staff can rename them under Catalog → Attributes. */
const IMPORT_ATTRIBUTES = {
  fit: { name: { en: "Fit", bn: "ফিট" }, type: "select" as const },
  occasion: { name: { en: "Occasion", bn: "উপলক্ষ" }, type: "multiselect" as const },
};

interface RowOutcome {
  error: RowValidationError | null;
  warnings: string[];
  created: boolean;
  imagesHandled: number;
}

interface ChunkContext {
  jobId: string;
  actor: AuthenticatedStaff;
  /** True when the job has a ZIP and the mapping has no `images` column — images then match by SKU file-name prefix. */
  matchImagesBySku: boolean;
  hasArchive: boolean;
  archiveNames: string[] | null;
}

export interface ImportUpload {
  buffer: Buffer;
  fileName: string;
  mapping?: unknown;
  options?: unknown;
  archive?: Buffer | null;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function localizedNames(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>)
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().toLowerCase());
}

/** New localized text is merged into what the product already has, so a Bangla-only cell never wipes an English value entered by hand. */
function mergeLocalized(existing: unknown, incoming: LocalizedInput): Prisma.InputJsonValue {
  const base = existing && typeof existing === "object" ? (existing as Record<string, unknown>) : {};
  return { ...base, ...incoming };
}

function systemActor(staffId: string | null): AuthenticatedStaff {
  return { id: staffId ?? "system", name: "Catalog import", email: "", locale: "en", permissions: new Set(), isSuperAdmin: false, totpEnabled: true };
}

@Injectable()
export class CatalogImportService implements OnModuleInit {
  private readonly logger = new Logger(CatalogImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scheduler: SchedulerService,
    private readonly inventory: InventoryService,
    private readonly media: MediaService,
    private readonly mediaUsage: MediaUsageService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerHandler(TASK_TYPE, async (payload) => {
      const { jobId } = payload as { jobId: string };
      await this.processChunk(jobId);
    });
  }

  /** Headers, sample rows, and the auto-suggested mapping — the first step of the admin mapping screen. */
  inspect(buffer: Buffer, fileName: string) {
    const sheet = inspectWorkbook(buffer, fileName);
    if (sheet.headers.length === 0) throw new BadRequestException({ code: "EMPTY_FILE", message: "The first sheet has no header row" });
    const suggestedMapping = suggestMapping(sheet.headers);
    return {
      ...sheet,
      suggestedMapping,
      suggestedOptions: suggestOptions(suggestedMapping),
      fields: IMPORT_FIELDS.map((key) => ({ key, level: IMPORT_FIELD_LEVELS[key] })),
    };
  }

  private resolveMapping(rawRows: Record<string, unknown>[], mappingInput: unknown, optionsInput: unknown): { mapping: ColumnMapping; options: ImportOptions; explicit: boolean } {
    const explicitMapping = sanitizeMapping(mappingInput);
    const mapping = explicitMapping ?? suggestMapping(Object.keys(rawRows[0] ?? {}));
    const options = optionsInput ? sanitizeOptions(optionsInput) : suggestOptions(mapping);
    return { mapping, options, explicit: explicitMapping !== null };
  }

  /** Dry run: parses and validates every row without touching the database (docs/PROJECT_SPEC.md §8.2 "dry-run validation report"); with a ZIP, also reports image names the archive doesn't contain. */
  dryRun(buffer: Buffer, fileName: string, mappingInput?: unknown, optionsInput?: unknown, archive?: Buffer | null) {
    const rawRows = parseWorkbookRows(buffer, fileName);
    const { mapping, options } = this.resolveMapping(rawRows, mappingInput, optionsInput);
    const archiveNames = archive ? new Set(this.listArchive(archive)) : null;
    const issues: RowValidationError[] = [];
    let validCount = 0;
    let warningCount = 0;
    rawRows.forEach((raw, index) => {
      const rowNumber = index + 2; // 1-based, plus the header row
      const { row, error, warnings } = validateImportRow(raw, rowNumber, mapping, options);
      const rowWarnings = [...warnings];
      if (row?.images) {
        for (const token of row.images) {
          if (isImageUrl(token)) continue;
          if (!archiveNames) rowWarnings.push(`Image "${token}" is listed but no images ZIP was chosen`);
          else if (!archiveNames.has(archiveBaseName(token))) rowWarnings.push(`Image "${token}" is not in the ZIP`);
        }
      }
      if (error) issues.push(error);
      else validCount += 1;
      if (rowWarnings.length > 0) {
        warningCount += 1;
        issues.push({ row: rowNumber, sku: row?.sku ?? error?.sku ?? null, message: rowWarnings.join("; "), level: "warning" });
      }
    });
    const errorCount = rawRows.length - validCount;
    return { totalRows: rawRows.length, validCount, errorCount, warningCount, imageCount: archiveNames?.size ?? 0, mapping, options, errors: issues.slice(0, 200) };
  }

  private listArchive(archive: Buffer): string[] {
    try {
      return listArchiveImageNames(archive);
    } catch (error) {
      throw new BadRequestException({ code: "INVALID_ARCHIVE", message: error instanceof Error ? error.message : "Invalid ZIP" });
    }
  }

  async create(upload: ImportUpload, actor: AuthenticatedStaff) {
    const rawRows = parseWorkbookRows(upload.buffer, upload.fileName);
    if (rawRows.length === 0) throw new BadRequestException({ code: "EMPTY_FILE", message: "No rows found in the uploaded file" });
    const { mapping, options, explicit } = this.resolveMapping(rawRows, upload.mapping, upload.options);

    let images: { name: string; data: Uint8Array }[] = [];
    let skippedImages: { name: string; reason: string }[] = [];
    if (upload.archive) {
      try {
        ({ images, skipped: skippedImages } = extractImageArchive(upload.archive));
      } catch (error) {
        throw new BadRequestException({ code: "INVALID_ARCHIVE", message: error instanceof ImageArchiveError ? error.message : "Invalid ZIP" });
      }
    }

    const job = await this.prisma.catalogImportJob.create({
      // Node's Buffer and Prisma's Bytes input type disagree on the exact
      // ArrayBuffer generic parameter under the current @types/node — safe,
      // since Buffer *is* a Uint8Array at runtime.
      data: {
        fileName: upload.fileName,
        fileBytes: upload.buffer as never,
        totalRows: rawRows.length,
        createdBy: actor.id,
        mapping: explicit ? toJson(mapping) : Prisma.DbNull,
        options: toJson(options),
      },
    });

    // Batched inserts keep each statement well under typical request/packet limits.
    let batch: { jobId: string; name: string; bytes: never; sizeBytes: number }[] = [];
    let batchBytes = 0;
    const flush = async () => {
      if (batch.length === 0) return;
      await this.prisma.catalogImportFile.createMany({ data: batch, skipDuplicates: true });
      batch = [];
      batchBytes = 0;
    };
    for (const image of images) {
      batch.push({ jobId: job.id, name: image.name, bytes: Buffer.from(image.data) as never, sizeBytes: image.data.byteLength });
      batchBytes += image.data.byteLength;
      if (batchBytes >= FILE_INSERT_BATCH_BYTES) await flush();
    }
    await flush();

    await this.prisma.scheduledTask.create({ data: { type: TASK_TYPE, payload: { jobId: job.id } as object, runAt: new Date() } });
    await this.audit.record({
      actorType: "staff",
      actorId: actor.id,
      action: "catalog_import.create",
      entityType: "catalog_import_job",
      entityId: job.id,
      after: { fileName: upload.fileName, totalRows: rawRows.length, imageCount: images.length, priceUnit: options.priceUnit, explicitMapping: explicit },
    });
    return { id: job.id, status: job.status, totalRows: job.totalRows, imageCount: images.length, skippedImages };
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

  /** CSV of every row the job failed or warned about, for download from the job's progress UI. */
  async downloadErrorReport(id: string): Promise<string> {
    const job = await this.prisma.catalogImportJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException("Import job not found");
    const errors: RowValidationError[] = job.errorReport ? JSON.parse(job.errorReport) : [];
    return rowsToCsv(errors.map((e) => ({ row: e.row, sku: e.sku ?? "", level: e.level ?? "error", message: e.message })));
  }

  // ---------------------------------------------------------------------------
  // Saved mappings (§8.2 column mapping, reused across uploads of one template)
  // ---------------------------------------------------------------------------

  async listPresets() {
    return await this.prisma.catalogImportPreset.findMany({ orderBy: { name: "asc" } });
  }

  async savePreset(name: string, mappingInput: unknown, optionsInput: unknown, actor: AuthenticatedStaff) {
    const mapping = sanitizeMapping(mappingInput);
    if (!mapping) throw new BadRequestException({ code: "VALIDATION_ERROR", message: "mapping must be an object of header → field" });
    const options = sanitizeOptions(optionsInput);
    const preset = await this.prisma.catalogImportPreset.upsert({
      where: { name },
      create: { name, mapping: toJson(mapping), options: toJson(options), createdBy: actor.id },
      update: { mapping: toJson(mapping), options: toJson(options) },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "catalog_import_preset.save", entityType: "catalog_import_preset", entityId: preset.id, after: { name } });
    return preset;
  }

  async deletePreset(id: string, actor: AuthenticatedStaff) {
    const preset = await this.prisma.catalogImportPreset.findUnique({ where: { id } });
    if (!preset) throw new NotFoundException("Preset not found");
    await this.prisma.catalogImportPreset.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "catalog_import_preset.delete", entityType: "catalog_import_preset", entityId: id, before: { name: preset.name } });
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Row import
  // ---------------------------------------------------------------------------

  /** `Men > Panjabi` — walks the tree by name (either language) or slug under each parent, creating any missing level. */
  private async resolveCategoryPath(path: string[]): Promise<{ categoryId: string; created: string[] }> {
    let parentId: string | null = null;
    const slugParts: string[] = [];
    const created: string[] = [];
    for (const [depth, segment] of path.entries()) {
      const segmentSlug = slugify(segment, "category");
      slugParts.push(segmentSlug);
      const siblings: { id: string; name: unknown; slug: string }[] = await this.prisma.category.findMany({ where: { parentId, deletedAt: null }, select: { id: true, name: true, slug: true } });
      const wanted = segment.trim().toLowerCase();
      let match = siblings.find((c) => localizedNames(c.name).includes(wanted)) ?? siblings.find((c) => c.slug === segmentSlug || c.slug === slugParts.join("-"));
      if (!match) {
        const slug = await uniqueSlug(slugParts.join("-"), async (candidate) => !!(await this.prisma.category.findUnique({ where: { slug: candidate } })));
        const name = /[ঀ-৿]/.test(segment) ? { bn: segment.trim() } : { en: segment.trim() };
        match = await this.prisma.category.create({ data: { name, slug, parentId }, select: { id: true, name: true, slug: true } });
        created.push(path.slice(0, depth + 1).join(" > "));
      }
      parentId = match.id;
    }
    return { categoryId: parentId!, created };
  }

  private async resolveCategory(row: ImportRow): Promise<{ categoryId: string | null | undefined; error: string | null; created: string[] }> {
    if (row.categorySlug) {
      const category = await this.prisma.category.findUnique({ where: { slug: row.categorySlug } });
      if (!category) return { categoryId: undefined, error: `Unknown categorySlug "${row.categorySlug}"`, created: [] };
      return { categoryId: category.id, error: null, created: [] };
    }
    if (row.categoryPath) {
      const { categoryId, created } = await this.resolveCategoryPath(row.categoryPath);
      return { categoryId, error: null, created };
    }
    return { categoryId: undefined, error: null, created: [] };
  }

  private async resolveSizeChartId(name: string): Promise<string | null> {
    const charts = await this.prisma.sizeChart.findMany({ select: { id: true, name: true } });
    const wanted = name.trim().toLowerCase();
    return charts.find((chart) => localizedNames(chart.name).includes(wanted))?.id ?? null;
  }

  private async ensureAttributeValueIds(code: keyof typeof IMPORT_ATTRIBUTES, labels: string[]): Promise<{ attributeId: string; valueIds: string[] }> {
    const definition = IMPORT_ATTRIBUTES[code];
    const attribute = (await this.prisma.attribute.findUnique({ where: { code } })) ?? (await this.prisma.attribute.create({ data: { code, name: definition.name, type: definition.type } }));
    const valueIds: string[] = [];
    for (const label of labels) {
      const slug = slugify(label, `value-${valueIds.length + 1}`);
      const existing = await this.prisma.attributeValue.findUnique({ where: { attributeId_slug: { attributeId: attribute.id, slug } } });
      const value = existing ?? (await this.prisma.attributeValue.create({ data: { attributeId: attribute.id, slug, value: /[ঀ-৿]/.test(label) ? { bn: label } : { en: label } } }));
      valueIds.push(value.id);
    }
    return { attributeId: attribute.id, valueIds };
  }

  private async setProductAttribute(productId: string, code: keyof typeof IMPORT_ATTRIBUTES, labels: string[]): Promise<void> {
    const { attributeId, valueIds } = await this.ensureAttributeValueIds(code, labels);
    await this.prisma.$transaction([
      this.prisma.productAttributeValue.deleteMany({ where: { productId, attributeId } }),
      this.prisma.productAttributeValue.createMany({ data: valueIds.map((attributeValueId) => ({ productId, attributeId, attributeValueId })) }),
    ]);
  }

  /**
   * Resolves a row's option inputs to option-value ids (ordered by option position), creating options/values as needed.
   * The row's `colorHex` goes to whichever option resolves to the colour type (known only now, since
   * continuation rows leave option names blank). Returns the colour value's id (images on that row are
   * tied to it, §8.2 per-colour gallery).
   */
  private async resolveOptionValues(productId: string, inputs: ImportOptionInput[], colorHex: string | undefined): Promise<{ ids: string[]; colorValueId: string | null; error: string | null }> {
    if (inputs.length === 0) return { ids: [], colorValueId: null, error: null };
    const options = await this.prisma.productOption.findMany({ where: { productId }, include: { values: true }, orderBy: { position: "asc" } });
    const resolved: { position: number; id: string }[] = [];
    let colorValueId: string | null = null;

    for (const input of inputs) {
      let option = input.name
        ? options.find((o) => localizedNames(o.name).includes(input.name!.trim().toLowerCase()))
        : options.find((o) => o.position === input.position);
      if (!option && !input.name) {
        return { ids: [], colorValueId: null, error: `option${input.position + 1} has a value ("${input.value}") but no option name — put the name on this product's first row` };
      }
      if (!option) {
        const created = await this.prisma.productOption.create({
          data: { productId, name: /[ঀ-৿]/.test(input.name!) ? { bn: input.name! } : { en: input.name! }, type: optionTypeForName(input.name!), position: input.position },
        });
        option = { ...created, values: [] };
        options.push(option);
      }
      const wanted = input.value.trim().toLowerCase();
      let value = option.values.find((v) => localizedNames(v.value).includes(wanted));
      if (!value) {
        value = await this.prisma.productOptionValue.create({
          data: {
            productOptionId: option.id,
            value: /[ঀ-৿]/.test(input.value) ? { bn: input.value } : { en: input.value },
            colorHex: option.type === "color" ? (colorHex ?? null) : null,
            position: option.values.length,
          },
        });
        option.values.push(value);
      } else if (option.type === "color" && colorHex && !value.colorHex) {
        value = await this.prisma.productOptionValue.update({ where: { id: value.id }, data: { colorHex } });
      }
      resolved.push({ position: option.position, id: value.id });
      if (option.type === "color") colorValueId = value.id;
    }
    resolved.sort((a, b) => a.position - b.position);
    return { ids: resolved.map((r) => r.id), colorValueId, error: null };
  }

  private async upsertProduct(row: ImportRow, categoryId: string | null | undefined, sizeChartId: string | null | undefined) {
    const slug = slugify(row.productSlug, row.productSlug.toLowerCase());
    const existing = await this.prisma.product.findUnique({ where: { slug } });

    const data: Prisma.ProductUncheckedUpdateInput = {};
    if (row.title) data.title = mergeLocalized(existing?.title, row.title);
    if (categoryId !== undefined) data.categoryId = categoryId;
    if (sizeChartId) data.sizeChartId = sizeChartId;
    if (row.status) {
      data.status = row.status;
      if (row.status === "active" && !existing?.publishedAt) data.publishedAt = new Date();
    }
    if (row.tags) data.tags = row.tags;
    if (row.description) data.description = mergeLocalized(existing?.description, row.description);
    if (row.careInstructions) data.careInstructions = mergeLocalized(existing?.careInstructions, row.careInstructions);
    if (row.fabric) data.fabric = mergeLocalized(existing?.fabric, row.fabric);
    if (row.modelInfo) data.modelInfo = mergeLocalized(existing?.modelInfo, row.modelInfo);
    if (row.seoTitle) data.seoTitle = mergeLocalized(existing?.seoTitle, row.seoTitle);
    if (row.seoDescription) data.seoDescription = mergeLocalized(existing?.seoDescription, row.seoDescription);
    if (row.isFeatured !== undefined) data.isFeatured = row.isFeatured;

    // Deleting a product in the admin only soft-deletes it (deletedAt + archived),
    // and slugs stay unique, so a re-import of the same slug lands on that hidden
    // row. Without reviving it the import reported success while the product
    // stayed invisible in the admin and the storefront.
    if (existing?.deletedAt) {
      data.deletedAt = null;
      if (!row.status) data.status = "draft";
    }

    if (!existing) {
      return await this.prisma.product.create({
        data: {
          ...(data as Prisma.ProductUncheckedCreateInput),
          slug,
          title: (data.title as Prisma.InputJsonValue | undefined) ?? { en: row.productSlug },
          status: row.status ?? "draft",
          tags: row.tags ?? [],
          weightGramsDefault: row.weightGrams ?? null,
        },
      });
    }
    if (Object.keys(data).length === 0) return existing;
    if (existing.deletedAt) {
      // A deleted product coming back from the sheet takes its images from this
      // import. Its old gallery links would otherwise make attachImages skip
      // every same-named file as "already there", even when those old files
      // are gone (e.g. stored on a host's wiped local disk) and show broken.
      await this.prisma.productMedia.deleteMany({ where: { productId: existing.id } });
    }
    return await this.prisma.product.update({ where: { id: existing.id }, data });
  }

  private async fetchImage(token: string, ctx: ChunkContext): Promise<{ name: string; buffer: Buffer; mimeType: string } | string> {
    if (isImageUrl(token)) {
      try {
        await assertPublicHttpsUrl(token);
      } catch {
        return `Image URL "${token}" must use https and point to a public address`;
      }
      try {
        const response = await fetch(token, { redirect: "error", signal: AbortSignal.timeout(URL_IMAGE_TIMEOUT_MS) });
        if (!response.ok) return `Image URL "${token}" returned HTTP ${response.status}`;
        const declared = Number(response.headers.get("content-length") ?? "0");
        if (declared > URL_IMAGE_MAX_BYTES) return `Image URL "${token}" is larger than 15 MB`;
        const mimeType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim();
        if (!mimeType.startsWith("image/")) return `Image URL "${token}" is not an image (${mimeType || "unknown type"})`;
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength > URL_IMAGE_MAX_BYTES) return `Image URL "${token}" is larger than 15 MB`;
        const name = archiveBaseName(new URL(token).pathname) || "image";
        return { name, buffer, mimeType };
      } catch (error) {
        return `Image URL "${token}" could not be downloaded (${error instanceof Error ? error.message : "unknown error"})`;
      }
    }
    if (!ctx.hasArchive) return `Image "${token}" is listed but no images ZIP was uploaded`;
    const name = archiveBaseName(token);
    const file = await this.prisma.catalogImportFile.findUnique({ where: { jobId_name: { jobId: ctx.jobId, name } } });
    if (!file) return `Image "${token}" is not in the uploaded ZIP`;
    const extension = name.split(".").pop() ?? "";
    return { name, buffer: Buffer.from(file.bytes), mimeType: MIME_BY_EXTENSION[extension] ?? "application/octet-stream" };
  }

  /** Uploads each image through the media library (generating the usual sized variants) and adds it to the product's gallery, tied to the row's colour. Re-imports skip images the product already has (matched by file name). */
  private async attachImages(productId: string, tokens: string[], optionValueId: string | null, ctx: ChunkContext): Promise<{ warnings: string[]; handled: number }> {
    const warnings: string[] = [];
    const existing = await this.prisma.productMedia.findMany({ where: { productId }, select: { mediaId: true, media: { select: { originalName: true } } } });
    const existingNames = new Set(existing.map((entry) => entry.media.originalName.toLowerCase()));
    let position = existing.length;
    let handled = 0;
    const mediaIds = existing.map((entry) => entry.mediaId);

    for (const token of tokens) {
      const plannedName = isImageUrl(token) ? archiveBaseName(token.split("?")[0]!) : archiveBaseName(token);
      if (existingNames.has(plannedName)) continue;
      handled += 1;
      const fetched = await this.fetchImage(token, ctx);
      if (typeof fetched === "string") {
        warnings.push(fetched);
        continue;
      }
      try {
        const media = await this.media.upload({ originalname: fetched.name, mimetype: fetched.mimeType, buffer: fetched.buffer, size: fetched.buffer.byteLength }, null, ctx.actor, { ip: null, userAgent: null });
        await this.prisma.productMedia.create({ data: { productId, mediaId: media.id, optionValueId, position } });
        position += 1;
        mediaIds.push(media.id);
        existingNames.add(fetched.name);
      } catch (error) {
        warnings.push(`Image "${token}" could not be stored (${error instanceof Error ? error.message : "unknown error"})`);
      }
    }
    if (mediaIds.length > existing.length) await this.mediaUsage.sync("product", productId, mediaIds);
    return { warnings, handled };
  }

  private async importRow(row: ImportRow, rowNumber: number, ctx: ChunkContext): Promise<RowOutcome> {
    const warnings: string[] = [];
    const fail = (message: string): RowOutcome => ({ error: { row: rowNumber, sku: row.sku, message, level: "error" }, warnings, created: false, imagesHandled: 0 });

    // Checked before anything is written, so a clashing SKU never leaves a half-created product behind.
    const existingVariant = await this.prisma.productVariant.findUnique({ where: { sku: row.sku }, include: { product: { select: { slug: true } } } });
    const rowSlug = slugify(row.productSlug, row.productSlug.toLowerCase());
    if (existingVariant && existingVariant.product.slug !== rowSlug) {
      return fail(`SKU "${row.sku}" already belongs to a different product ("${existingVariant.product.slug}")`);
    }

    const { categoryId, error: categoryError, created: createdCategories } = await this.resolveCategory(row);
    if (categoryError) return fail(categoryError);
    if (createdCategories.length > 0) {
      warnings.push(`Created categor${createdCategories.length === 1 ? "y" : "ies"}: ${createdCategories.join(", ")}`);
      await this.audit.record({ actorType: "staff", actorId: ctx.actor.id, action: "catalog_import.create_categories", entityType: "catalog_import_job", entityId: ctx.jobId, after: { paths: createdCategories } });
    }

    let sizeChartId: string | null | undefined;
    if (row.sizeChart) {
      sizeChartId = await this.resolveSizeChartId(row.sizeChart);
      if (!sizeChartId) warnings.push(`Size chart "${row.sizeChart}" not found — create it under Catalog → Size charts, then re-import or pick it on the product`);
    }

    const product = await this.upsertProduct(row, categoryId, sizeChartId);
    if (row.fit) await this.setProductAttribute(product.id, "fit", [row.fit]);
    if (row.occasion) await this.setProductAttribute(product.id, "occasion", row.occasion);

    const { ids: optionValueIds, colorValueId, error: optionError } = await this.resolveOptionValues(product.id, row.options, row.colorHex);
    if (optionError) return fail(optionError);

    const variantData = {
      optionValueIds,
      price: row.price,
      compareAtPrice: row.compareAtPrice ?? null,
      costPrice: row.costPrice ?? null,
      barcode: row.barcode ?? null,
      weightGrams: row.weightGrams ?? null,
    };
    const variant = existingVariant
      ? await this.prisma.productVariant.update({ where: { id: existingVariant.id }, data: variantData })
      : await this.prisma.productVariant.create({ data: { productId: product.id, sku: row.sku, ...variantData } });

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

    let imageTokens = row.images ?? [];
    if (imageTokens.length === 0 && ctx.matchImagesBySku && ctx.archiveNames) {
      imageTokens = ctx.archiveNames.filter((name) => matchesSku(name, row.sku)).sort();
    }
    let imagesHandled = 0;
    if (imageTokens.length > 0) {
      const result = await this.attachImages(product.id, imageTokens, colorValueId, ctx);
      warnings.push(...result.warnings);
      imagesHandled = result.handled;
    }

    return { error: null, warnings, created: !existingVariant, imagesHandled };
  }

  private async processChunk(jobId: string): Promise<void> {
    const job = await this.prisma.catalogImportJob.findUnique({ where: { id: jobId } });
    if (!job || job.status === "done" || job.status === "cancelled" || job.status === "failed" || !job.fileBytes) return;

    if (job.status === "pending") await this.prisma.catalogImportJob.update({ where: { id: jobId }, data: { status: "running" } });

    const rawRows = parseWorkbookRows(Buffer.from(job.fileBytes), job.fileName);
    const mapping = sanitizeMapping(job.mapping) ?? suggestMapping(Object.keys(rawRows[0] ?? {}));
    const options = job.options ? sanitizeOptions(job.options) : suggestOptions(mapping);
    const hasImagesColumn = Object.values(mapping).includes("images");
    const fileCount = await this.prisma.catalogImportFile.count({ where: { jobId } });
    const ctx: ChunkContext = {
      jobId,
      actor: systemActor(job.createdBy),
      hasArchive: fileCount > 0,
      matchImagesBySku: fileCount > 0 && !hasImagesColumn,
      archiveNames: fileCount > 0 && !hasImagesColumn ? (await this.prisma.catalogImportFile.findMany({ where: { jobId }, select: { name: true } })).map((f) => f.name) : null,
    };

    let createdRows = job.createdRows;
    let updatedRows = job.updatedRows;
    let errorRows = job.errorRows;
    let warningRows = job.warningRows;
    const newIssues: RowValidationError[] = [];
    let processed = 0;
    let imagesThisChunk = 0;

    for (let index = job.cursor; index < rawRows.length && processed < CHUNK_SIZE && imagesThisChunk < IMAGES_PER_CHUNK; index += 1) {
      const rowNumber = index + 2;
      processed += 1;
      const { row, error, warnings: validationWarnings } = validateImportRow(rawRows[index]!, rowNumber, mapping, options);
      const rowWarnings = [...validationWarnings];
      if (error) {
        errorRows += 1;
        newIssues.push(error);
      } else {
        try {
          const outcome = await this.importRow(row, rowNumber, ctx);
          rowWarnings.push(...outcome.warnings);
          imagesThisChunk += outcome.imagesHandled;
          if (outcome.error) {
            errorRows += 1;
            newIssues.push(outcome.error);
          } else if (outcome.created) {
            createdRows += 1;
          } else {
            updatedRows += 1;
          }
        } catch (err) {
          errorRows += 1;
          newIssues.push({ row: rowNumber, sku: row.sku, message: err instanceof Error ? err.message : "Unknown error", level: "error" });
          this.logger.error(`Import job ${jobId} row ${rowNumber} failed: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }
      if (rowWarnings.length > 0) {
        warningRows += 1;
        newIssues.push({ row: rowNumber, sku: row?.sku ?? error?.sku ?? null, message: rowWarnings.join("; "), level: "warning" });
      }
    }

    const cursor = job.cursor + processed;
    const processedRows = job.processedRows + processed;
    // Accumulated as JSON while the job runs (exact, no lossy CSV round-trip
    // through a field that might itself contain commas) — `downloadErrorReport`
    // renders it to CSV on demand, once, for the admin to download.
    const allIssues: RowValidationError[] = [...(job.errorReport ? (JSON.parse(job.errorReport) as RowValidationError[]) : []), ...newIssues];
    const hasMore = cursor < job.totalRows;

    // Optimistic lock on the cursor: if this chunk's task was reclaimed as stale and re-run while this
    // run was hung (SchedulerService.recoverStaleTasks), the re-run already advanced the job — a late
    // finish here must neither rewind the cursor nor start a second chain of chunks. (Rows it touched
    // were upserts, so re-processing them is harmless.)
    const saved = await this.prisma.catalogImportJob.updateMany({
      where: { id: jobId, cursor: job.cursor },
      data: {
        cursor,
        processedRows,
        createdRows,
        updatedRows,
        errorRows,
        warningRows,
        errorReport: JSON.stringify(allIssues),
        ...(hasMore ? {} : { status: "done", finishedAt: new Date(), fileBytes: null }),
      },
    });
    if (saved.count === 0) {
      this.logger.warn(`Import job ${jobId}: chunk at row ${job.cursor + 2} finished after another run had advanced the job — result discarded`);
      return;
    }

    if (hasMore) {
      await this.prisma.scheduledTask.create({ data: { type: TASK_TYPE, payload: { jobId } as object, runAt: new Date() } });
    } else {
      // The ZIP's images now live in the media library; the per-job copies are scratch data.
      if (ctx.hasArchive) await this.prisma.catalogImportFile.deleteMany({ where: { jobId } });
      await this.audit.record({ actorType: "system", action: "catalog_import.finish", entityType: "catalog_import_job", entityId: jobId, after: { createdRows, updatedRows, errorRows, warningRows } });
    }
  }
}
