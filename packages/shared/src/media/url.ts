/**
 * The one place that turns a media asset into a delivery URL
 * (docs/PROJECT_SPEC.md §4.3 / the Cloudinary change request, 2026-10-22).
 * Pure and isomorphic — no Node APIs, no secrets — so both `apps/api`
 * (building API response convenience URLs) and the browser (a Next.js
 * image loader requesting an arbitrary width with no extra API round
 * trip) can call it. No component may build a media URL any other way.
 */

export type MediaUrlFormat = "auto" | "webp" | "avif" | "jpg" | "png";
export type MediaUrlCrop = "fill" | "limit";

export interface MediaVariant {
  url: string;
  width: number;
  height: number;
}

export interface MediaRef {
  provider: "local" | "s3" | "cloudinary";
  /** Cloudinary's own vocabulary (`media.resource_type` in the DB) — "raw" covers documents/fonts, which URL building treats identically. */
  resourceType: "image" | "video" | "raw";
  /** Original file's absolute URL. Always present, used as the fallback for every provider. */
  url: string;
  /** local/s3 only — pre-generated sizes. Null for cloudinary (sized on the fly) and non-images. */
  variants: Record<string, MediaVariant> | null;
  /** cloudinary only. */
  cloudName?: string | null;
  publicId?: string | null;
  version?: number | null;
  deliveryDomain?: string | null;
  focalX?: number | null;
  focalY?: number | null;
}

export interface MediaUrlOptions {
  width?: number;
  height?: number;
  format?: MediaUrlFormat;
  crop?: MediaUrlCrop;
}

export function getMediaUrl(ref: MediaRef, options: MediaUrlOptions = {}): string {
  if (ref.provider === "cloudinary" && ref.publicId && ref.cloudName) {
    return buildCloudinaryUrl(ref, options);
  }
  return pickNearestVariant(ref, options.width);
}

function pickNearestVariant(ref: MediaRef, width: number | undefined): string {
  if (!ref.variants || width === undefined) return ref.url;
  const sorted = Object.values(ref.variants).sort((a, b) => a.width - b.width);
  const fit = sorted.find((variant) => variant.width >= width);
  return (fit ?? sorted[sorted.length - 1])?.url ?? ref.url;
}

// Cloudinary transformation syntax: https://cloudinary.com/documentation/transformation_reference
// `fl_region_relative` makes x_/y_ fractions of the image's own dimensions
// (0..1), which is exactly how `focalX`/`focalY` are stored — see
// docs/DECISIONS.md (not validated against a live Cloudinary account; no
// credentials in this environment, covered by the mock driver instead).
function buildCloudinaryUrl(ref: MediaRef, options: MediaUrlOptions): string {
  const host = ref.deliveryDomain ? ref.deliveryDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "") : `res.cloudinary.com/${ref.cloudName}`;
  const resourceSegment = ref.resourceType === "video" ? "video" : ref.resourceType === "image" ? "image" : "raw";

  const transforms: string[] = [`f_${options.format ?? "auto"}`, "q_auto"];
  if (options.width !== undefined || options.height !== undefined) {
    const crop = options.crop ?? "limit";
    transforms.push(`c_${crop}`);
    if (options.width !== undefined) transforms.push(`w_${Math.round(options.width)}`);
    if (options.height !== undefined) transforms.push(`h_${Math.round(options.height)}`);
    if (crop === "fill" && ref.focalX != null && ref.focalY != null) {
      transforms.push("g_xy_center", `x_${ref.focalX}`, `y_${ref.focalY}`, "fl_region_relative");
    }
  }

  const versionSegment = ref.version ? `v${ref.version}/` : "";
  return `https://${host}/${resourceSegment}/upload/${transforms.join(",")}/${versionSegment}${ref.publicId}`;
}
