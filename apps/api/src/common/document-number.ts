import { dhakaDateKey } from "./dhaka-time";

/**
 * Human-readable document numbers for M12 documents — `PO-261112-0007`,
 * `TR-…`, `ST-…`: prefix, Dhaka date (YYMMDD), then a per-day sequence.
 * The caller supplies the highest number already issued with that
 * prefix+date; uniqueness is still enforced by the `number` column's unique
 * index, and callers retry on a P2002 collision (two staff creating at the
 * same instant).
 */
export function documentNumberPrefix(prefix: string, now: Date): string {
  const key = dhakaDateKey(now); // YYYY-MM-DD
  return `${prefix}-${key.slice(2, 4)}${key.slice(5, 7)}${key.slice(8, 10)}-`;
}

export function nextDocumentNumber(prefix: string, now: Date, latestToday: string | null): string {
  const head = documentNumberPrefix(prefix, now);
  const lastSeq = latestToday && latestToday.startsWith(head) ? Number.parseInt(latestToday.slice(head.length), 10) : 0;
  const seq = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
  return `${head}${String(seq).padStart(4, "0")}`;
}

/** Prisma unique-constraint violation. */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}

/** Runs `create(number)` with a freshly computed number, retrying a few times on a unique collision. */
export async function createWithDocumentNumber<T>(
  prefix: string,
  findLatest: (head: string) => Promise<string | null>,
  create: (number: string) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const now = new Date();
    const latest = await findLatest(documentNumberPrefix(prefix, now));
    try {
      return await create(nextDocumentNumber(prefix, now, latest));
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}
