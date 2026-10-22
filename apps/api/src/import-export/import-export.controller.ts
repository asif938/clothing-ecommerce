import { BadRequestException, Controller, Get, Param, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { CatalogExportService } from "./catalog-export.service";
import { CatalogImportService } from "./catalog-import.service";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

@ApiTags("catalog")
@Controller("admin/catalog")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("catalog.manage")
export class ImportExportController {
  constructor(
    private readonly importService: CatalogImportService,
    private readonly exportService: CatalogExportService,
  ) {}

  @Post("import/dry-run")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  dryRun(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException({ code: "FILE_REQUIRED", message: "Upload a .csv or .xlsx file" });
    return this.importService.dryRun(file.buffer, file.originalname);
  }

  @Post("import")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  create(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) throw new BadRequestException({ code: "FILE_REQUIRED", message: "Upload a .csv or .xlsx file" });
    return this.importService.create(file.buffer, file.originalname, req.staff!);
  }

  @Get("import")
  listImports() {
    return this.importService.list();
  }

  @Get("import/:id")
  getImport(@Param("id") id: string) {
    return this.importService.get(id);
  }

  @Get("import/:id/error-report")
  async downloadErrorReport(@Param("id") id: string, @Res() res: Response) {
    const csv = await this.importService.downloadErrorReport(id);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="import-${id}-errors.csv"`);
    res.send(csv);
  }

  @Get("export")
  async export(@Query("status") status: string | undefined, @Query("categoryId") categoryId: string | undefined, @Res() res: Response) {
    const csv = await this.exportService.exportCsv({ status, categoryId });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="catalog-export.csv"`);
    res.send(csv);
  }
}
