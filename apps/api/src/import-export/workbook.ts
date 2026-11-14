import * as XLSX from "xlsx";

const BOM = new RegExp("^\\uFEFF");

function readWorkbook(buffer: Buffer, fileName: string): XLSX.WorkBook {
  const isCsv = fileName.toLowerCase().endsWith(".csv");
  // Excel's "CSV UTF-8" export starts with a BOM (U+FEFF); left in place it becomes part of the first header.
  return isCsv ? XLSX.read(buffer.toString("utf-8").replace(BOM, ""), { type: "string" }) : XLSX.read(buffer, { type: "buffer" });
}

function firstSheet(workbook: XLSX.WorkBook): XLSX.WorkSheet | undefined {
  const firstSheetName = workbook.SheetNames[0];
  return firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
}

/** Reads the first sheet of a `.csv`/`.xlsx`/`.xls` upload into plain row objects keyed by header (later sheets, e.g. an instructions tab, are ignored). */
export function parseWorkbookRows(buffer: Buffer, fileName: string): Record<string, unknown>[] {
  const sheet = firstSheet(readWorkbook(buffer, fileName));
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
}

/** The first sheet's header row plus a few sample rows — what the admin column-mapping screen shows (§8.2). */
export function inspectWorkbook(buffer: Buffer, fileName: string, sampleSize = 3): { sheetName: string | null; headers: string[]; sampleRows: Record<string, unknown>[]; totalRows: number } {
  const workbook = readWorkbook(buffer, fileName);
  const sheetName = workbook.SheetNames[0] ?? null;
  const sheet = firstSheet(workbook);
  if (!sheet) return { sheetName, headers: [], sampleRows: [], totalRows: 0 };
  const headerRow = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true })[0] ?? [];
  const headers = headerRow.map((cell) => (cell === null || cell === undefined ? "" : String(cell))).filter((header) => header.trim() !== "");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
  return { sheetName, headers, sampleRows: rows.slice(0, sampleSize), totalRows: rows.length };
}

/** Builds a `.csv` text blob from row objects (export, and the import job's error report). */
export function rowsToCsv(rows: Record<string, unknown>[]): string {
  const sheet = XLSX.utils.json_to_sheet(rows);
  return XLSX.utils.sheet_to_csv(sheet);
}
