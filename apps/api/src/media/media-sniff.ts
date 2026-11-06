import { BadRequestException } from "@nestjs/common";

/**
 * §12 "file upload validation (MIME sniffing ...; no SVG uploads unless
 * sanitized)". Multer's `file.mimetype` is whatever `Content-Type` the
 * client's multipart request claimed — entirely attacker-controlled. This
 * looks at the actual bytes instead, for exactly the two things that
 * matter here: (1) catching a file that's really SVG/HTML/XML — which can
 * carry a `<script>` and would be a stored-XSS risk served from our own
 * media domain, and which this project has no sanitizer for, so it's
 * refused outright rather than half-trusted; (2) catching an "image" claim
 * that isn't actually one of the raster formats `sharp` (and this
 * project's variant pipeline) supports.
 */
const IMAGE_SIGNATURES: { mime: string; matches: (buf: Buffer) => boolean }[] = [
  { mime: "image/jpeg", matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", matches: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/gif", matches: (b) => b.length >= 6 && (b.subarray(0, 6).toString("ascii") === "GIF87a" || b.subarray(0, 6).toString("ascii") === "GIF89a") },
  { mime: "image/webp", matches: (b) => b.length >= 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
];

/** First ~1KB, trimmed of whitespace/BOM, lowercased — enough to catch an SVG/HTML/XML polyglot regardless of claimed MIME type or extension. */
function looksLikeMarkup(buffer: Buffer): boolean {
  const head = buffer
    .subarray(0, 1024)
    .toString("utf8")
    .replace(/^\uFEFF/, "")
    .trimStart()
    .toLowerCase();
  return head.startsWith("<?xml") || head.startsWith("<svg") || head.startsWith("<!doctype html") || head.startsWith("<html");
}

export function sniffImageMime(buffer: Buffer): string | null {
  return IMAGE_SIGNATURES.find((sig) => sig.matches(buffer))?.mime ?? null;
}

/** Throws if the upload should be refused outright; otherwise returns the sniffed image MIME (or null for a non-image kind that passed the markup check). */
export function assertSafeUpload(buffer: Buffer, claimedMimeType: string): string | null {
  if (looksLikeMarkup(buffer)) {
    throw new BadRequestException({
      code: "SVG_OR_HTML_NOT_ALLOWED",
      message: "SVG/HTML/XML uploads aren't accepted (no sanitizer is wired up for them yet)",
    });
  }
  if (!claimedMimeType.startsWith("image/")) return null;

  const sniffed = sniffImageMime(buffer);
  if (!sniffed) {
    throw new BadRequestException({
      code: "UNRECOGNIZED_IMAGE",
      message: "This doesn't look like a JPEG, PNG, GIF, or WebP file",
    });
  }
  return sniffed;
}
