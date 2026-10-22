import * as XLSX from "xlsx";

/** Reads the first sheet of a `.csv`/`.xlsx`/`.xls` upload into plain row objects keyed by header. */
export function parseWorkbookRows(buffer: Buffer, fileName: string): Record<string, unknown>[] {
  const isCsv = fileName.toLowerCase().endsWith(".csv");
  const workbook = isCsv ? XLSX.read(buffer.toString("utf-8"), { type: "string" }) : XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
}

/** Builds a `.csv` text blob from row objects (export, and the import job's error report). */
export function rowsToCsv(rows: Record<string, unknown>[]): string {
  const sheet = XLSX.utils.json_to_sheet(rows);
  return XLSX.utils.sheet_to_csv(sheet);
}
