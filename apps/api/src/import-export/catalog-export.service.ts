import { Injectable } from "@nestjs/common";
import type { LocalizedText } from "@clothing/shared";
import { PrismaService } from "../prisma/prisma.service";
import { buildExportRows, type ExportableProduct } from "./csv-export";
import { rowsToCsv } from "./workbook";

export interface ExportFilters {
  status?: string;
  categoryId?: string;
}

@Injectable()
export class CatalogExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportCsv(filters: ExportFilters): Promise<string> {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null, ...(filters.status ? { status: filters.status as never } : {}), ...(filters.categoryId ? { categoryId: filters.categoryId } : {}) },
      include: { category: { select: { slug: true } }, variants: true },
    });
    return rowsToCsv(buildExportRows(products.map((product) => ({ ...product, title: (product.title ?? {}) as LocalizedText })) as ExportableProduct[]));
  }
}
