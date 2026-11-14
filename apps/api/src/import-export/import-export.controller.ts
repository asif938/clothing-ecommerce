import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query, Req, Res, UploadedFile, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileFieldsInterceptor, FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { z } from "zod";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CatalogExportService } from "./catalog-export.service";
import { CatalogImportService } from "./catalog-import.service";

const MAX_SHEET_BYTES = 20 * 1024 * 1024;
/** The images ZIP can be much larger than the sheet; per-image and total-uncompressed limits are enforced while extracting (image-archive.ts). */
const MAX_ARCHIVE_BYTES = 150 * 1024 * 1024;

type UploadedImportFiles = { file?: Express.Multer.File[]; images?: Express.Multer.File[] };

const importFileFields = FileFieldsInterceptor(
  [
    { name: "file", maxCount: 1 },
    { name: "images", maxCount: 1 },
  ],
  { limits: { fileSize: MAX_ARCHIVE_BYTES } },
);

const presetSchema = z.object({
  name: z.string().trim().min(1).max(100),
  mapping: z.record(z.string(), z.string().nullable()),
  options: z.object({ priceUnit: z.enum(["bdt", "poisha"]) }).optional(),
});
type PresetDto = z.infer<typeof presetSchema>;

/** Multipart text fields arrive as strings; `mapping`/`options` are JSON. */
function parseJsonField(value: unknown, field: string): unknown {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new BadRequestException({ code: "VALIDATION_ERROR", message: `${field} must be valid JSON` });
  }
}

function sheetFrom(files: UploadedImportFiles): Express.Multer.File {
  const file = files.file?.[0];
  if (!file) throw new BadRequestException({ code: "FILE_REQUIRED", message: "Upload a .csv or .xlsx file" });
  if (file.size > MAX_SHEET_BYTES) throw new BadRequestException({ code: "FILE_TOO_LARGE", message: "The spreadsheet must be 20 MB or smaller" });
  return file;
}

function archiveFrom(files: UploadedImportFiles): Buffer | null {
  const archive = files.images?.[0];
  if (!archive) return null;
  if (!/\.zip$/i.test(archive.originalname)) throw new BadRequestException({ code: "INVALID_ARCHIVE", message: "Images must be uploaded as a .zip file" });
  return archive.buffer;
}

@ApiTags("catalog")
@Controller("admin/catalog")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("catalog.manage")
export class ImportExportController {
  constructor(
    private readonly importService: CatalogImportService,
    private readonly exportService: CatalogExportService,
  ) {}

  /** §8.2 column mapping, step 1: the sheet's headers, a few sample rows, and the suggested header → field mapping. */
  @Post("import/inspect")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_SHEET_BYTES } }))
  inspect(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException({ code: "FILE_REQUIRED", message: "Upload a .csv or .xlsx file" });
    return this.importService.inspect(file.buffer, file.originalname);
  }

  @Post("import/dry-run")
  @UseInterceptors(importFileFields)
  dryRun(@UploadedFiles() files: UploadedImportFiles, @Body() body: Record<string, unknown>) {
    const sheet = sheetFrom(files);
    return this.importService.dryRun(sheet.buffer, sheet.originalname, parseJsonField(body.mapping, "mapping"), parseJsonField(body.options, "options"), archiveFrom(files));
  }

  @Post("import")
  @UseInterceptors(importFileFields)
  create(@UploadedFiles() files: UploadedImportFiles, @Body() body: Record<string, unknown>, @Req() req: Request) {
    const sheet = sheetFrom(files);
    return this.importService.create(
      { buffer: sheet.buffer, fileName: sheet.originalname, mapping: parseJsonField(body.mapping, "mapping"), options: parseJsonField(body.options, "options"), archive: archiveFrom(files) },
      req.staff!,
    );
  }

  @Get("import")
  listImports() {
    return this.importService.list();
  }

  @Get("import/presets")
  listPresets() {
    return this.importService.listPresets();
  }

  @Put("import/presets")
  savePreset(@Body(new ZodValidationPipe(presetSchema)) body: PresetDto, @Req() req: Request) {
    return this.importService.savePreset(body.name, body.mapping, body.options, req.staff!);
  }

  @Delete("import/presets/:id")
  deletePreset(@Param("id") id: string, @Req() req: Request) {
    return this.importService.deletePreset(id, req.staff!);
  }

  @Get("import/:id")
  getImport(@Param("id") id: string) {
    return this.importService.get(id);
  }

  @Get("import/:id/error-report")
  async downloadErrorReport(@Param("id") id: string, @Res() res: Response) {
    const csv = await this.importService.downloadErrorReport(id);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="import-${id}-report.csv"`);
    // BOM so Excel opens the Bangla text as UTF-8.
    res.send(String.fromCharCode(0xfeff) + csv);
  }

  @Get("export")
  async export(@Query("status") status: string | undefined, @Query("categoryId") categoryId: string | undefined, @Res() res: Response) {
    const csv = await this.exportService.exportCsv({ status, categoryId });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="catalog-export.csv"`);
    res.send(csv);
  }
}
