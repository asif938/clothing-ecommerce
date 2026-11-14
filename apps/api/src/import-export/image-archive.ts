import { unzipSync } from "fflate";

/**
 * §8.2 "image import … by SKU-matched filenames (bulk upload zip)". The ZIP
 * comes from staff and is treated as untrusted:
 *  - nothing is ever written to disk, and names are reduced to their base name,
 *    so path tricks (`../../etc/x.jpg`, zip-slip) have nothing to escape into;
 *  - sizes are checked from the central directory *before* inflating, and the
 *    running total is capped, so a zip bomb is refused rather than expanded;
 *  - only image extensions are kept (and every file is content-sniffed again
 *    by `MediaService.upload` → `assertSafeUpload` before storage).
 */

export const IMAGE_ARCHIVE_LIMITS = {
  maxFiles: 2000,
  maxFileBytes: 15 * 1024 * 1024, // same as a single media-library upload
  maxTotalBytes: 300 * 1024 * 1024,
};

const IMAGE_EXTENSION = /\.(jpe?g|png|webp|avif|gif)$/i;

export interface ArchiveImage {
  /** Lower-cased base name, e.g. `pnj-1001-navy-1.jpg`. */
  name: string;
  data: Uint8Array;
}

export interface ExtractedArchive {
  images: ArchiveImage[];
  skipped: { name: string; reason: string }[];
}

export class ImageArchiveError extends Error {}

/** `folder/Sub/PNJ-1.JPG` → `pnj-1.jpg`; works for both `/` and `\` separators. */
export function archiveBaseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return (parts[parts.length - 1] ?? "").trim().toLowerCase();
}

function isJunkEntry(path: string, base: string): boolean {
  return path.endsWith("/") || path.startsWith("__MACOSX/") || path.includes("/__MACOSX/") || base.startsWith(".") || base === "thumbs.db" || base === "desktop.ini";
}

export function extractImageArchive(buffer: Uint8Array, limits = IMAGE_ARCHIVE_LIMITS): ExtractedArchive {
  const skipped: ExtractedArchive["skipped"] = [];
  const seen = new Set<string>();
  let entryCount = 0;
  let totalBytes = 0;

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buffer, {
      filter: (file) => {
        const base = archiveBaseName(file.name);
        if (isJunkEntry(file.name, base)) return false;
        entryCount += 1;
        if (entryCount > limits.maxFiles) throw new ImageArchiveError(`The ZIP has more than ${limits.maxFiles} files`);
        if (!IMAGE_EXTENSION.test(base)) {
          skipped.push({ name: file.name, reason: "not an image file (jpg, png, webp, avif, gif)" });
          return false;
        }
        if (file.originalSize > limits.maxFileBytes) {
          skipped.push({ name: file.name, reason: `larger than ${Math.round(limits.maxFileBytes / 1024 / 1024)} MB` });
          return false;
        }
        if (seen.has(base)) {
          skipped.push({ name: file.name, reason: "duplicate file name (another folder in the ZIP has the same name)" });
          return false;
        }
        totalBytes += file.originalSize;
        if (totalBytes > limits.maxTotalBytes) throw new ImageArchiveError(`The ZIP's images add up to more than ${Math.round(limits.maxTotalBytes / 1024 / 1024)} MB`);
        seen.add(base);
        return true;
      },
    });
  } catch (error) {
    if (error instanceof ImageArchiveError) throw error;
    throw new ImageArchiveError("The images file is not a valid ZIP archive");
  }

  const images: ArchiveImage[] = [];
  for (const [path, data] of Object.entries(files)) {
    // Declared sizes can lie; re-check what was actually inflated.
    if (data.byteLength > limits.maxFileBytes) {
      skipped.push({ name: path, reason: "larger than the per-image limit" });
      continue;
    }
    images.push({ name: archiveBaseName(path), data });
  }
  return { images, skipped };
}

/** Lists image names only (no inflating) — used by the dry run to report missing images cheaply. */
export function listArchiveImageNames(buffer: Uint8Array): string[] {
  const names: string[] = [];
  try {
    unzipSync(buffer, {
      filter: (file) => {
        const base = archiveBaseName(file.name);
        if (!isJunkEntry(file.name, base) && IMAGE_EXTENSION.test(base)) names.push(base);
        return false;
      },
    });
  } catch {
    throw new ImageArchiveError("The images file is not a valid ZIP archive");
  }
  return names;
}

/** True when `token` should be downloaded rather than looked up in the ZIP. */
export function isImageUrl(token: string): boolean {
  return /^https?:\/\//i.test(token.trim());
}

/** SKU fallback (no `images` column): `PNJ-1001-NAVY-M.jpg`, `PNJ-1001-NAVY-M-2.jpg`, `PNJ-1001-NAVY-M_back.png` all belong to SKU `PNJ-1001-NAVY-M`. */
export function matchesSku(fileName: string, sku: string): boolean {
  const stem = fileName.replace(/\.[^.]+$/, "").toLowerCase();
  const target = sku.trim().toLowerCase();
  return stem === target || stem.startsWith(`${target}-`) || stem.startsWith(`${target}_`);
}
