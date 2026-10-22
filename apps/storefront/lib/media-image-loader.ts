import { getMediaUrl, type MediaRef } from "@clothing/shared/media";

/**
 * The one place this app turns a media asset into an `<Image>` `src` for a
 * given width (docs/PROJECT_SPEC.md change request 2026-10-22, §4). No
 * component builds a media URL any other way — for a cloudinary-backed
 * asset this means an arbitrary width with no extra API round trip; for
 * local/s3 it picks the nearest pre-generated size. Wire a component to it
 * with `next/image`'s custom `loader` prop:
 * `<Image loader={mediaImageLoader(ref)} src={ref.url} .../>`.
 *
 * Unused until real product imagery lands (Milestone 3/4, docs/PROGRESS.md)
 * — this file is the ready extension point so that work doesn't have to
 * reinvent URL building.
 */
export function mediaImageLoader(ref: MediaRef) {
  return function loader({ width }: { width: number }): string {
    return getMediaUrl(ref, { width });
  };
}
