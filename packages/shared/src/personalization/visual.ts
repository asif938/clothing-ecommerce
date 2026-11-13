/**
 * Visual search features (docs/PROJECT_SPEC.md §16 M14 "visual search
 * (image upload → similar products via AI embeddings/vision)").
 *
 * The always-available half is a small, local "embedding" computed from
 * pixels — no provider, no cost, works on the free tier and with the mock
 * AI driver: a colour histogram of the garment (the background is
 * estimated from the border and ignored) plus a coarse silhouette grid.
 * The optional AI half (vision tags) is combined with it in `combinedScore`.
 *
 * Callers decode images themselves (the API uses sharp) and pass raw RGB
 * pixels at `VISUAL_WIDTH` × `VISUAL_HEIGHT`.
 */

/** Bump when the vector layout changes; stale rows are recomputed by the indexer. */
export const VISUAL_VECTOR_VERSION = 1;
export const VISUAL_WIDTH = 48;
export const VISUAL_HEIGHT = 64;

const HUE_BINS = 12;
const SAT_BINS = 2;
const VAL_BINS = 2;
const GREY_BINS = 4;
export const COLOR_BINS = HUE_BINS * SAT_BINS * VAL_BINS + GREY_BINS; // 52
const GRID_COLS = 6;
const GRID_ROWS = 8;
export const SHAPE_BINS = GRID_COLS * GRID_ROWS; // 48
export const VISUAL_VECTOR_LENGTH = COLOR_BINS + SHAPE_BINS;

/** RGB distance from the background colour above which a pixel counts as "garment". */
const FOREGROUND_DISTANCE = 42;
/** Below this foreground share the background guess is probably wrong (e.g. a full-bleed fabric close-up) — use every pixel. */
const MIN_FOREGROUND_SHARE = 0.06;

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : delta / max, max];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** Background guess: per-channel median of the outermost pixel ring. */
export function estimateBackground(pixels: Uint8Array | Buffer, width: number, height: number, channels = 3): [number, number, number] {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const sample = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    rs.push(pixels[i]!);
    gs.push(pixels[i + 1]!);
    bs.push(pixels[i + 2]!);
  };
  for (let x = 0; x < width; x++) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    sample(0, y);
    sample(width - 1, y);
  }
  return [median(rs), median(gs), median(bs)];
}

function colorBin(r: number, g: number, b: number): number {
  const [h, s, v] = rgbToHsv(r, g, b);
  if (s < 0.18 || v < 0.12) {
    // Achromatic: black / dark grey / light grey / white.
    return HUE_BINS * SAT_BINS * VAL_BINS + Math.min(GREY_BINS - 1, Math.floor(v * GREY_BINS));
  }
  const hueBin = Math.floor(h / (360 / HUE_BINS)) % HUE_BINS;
  const satBin = s < 0.55 ? 0 : 1;
  const valBin = v < 0.55 ? 0 : 1;
  return (hueBin * SAT_BINS + satBin) * VAL_BINS + valBin;
}

/**
 * The feature vector for one image: `COLOR_BINS` normalised histogram
 * values (sum 1) followed by `SHAPE_BINS` silhouette occupancy values (each
 * 0–1). Values are rounded to 4 decimals to keep stored rows small.
 */
export function computeVisualVector(pixels: Uint8Array | Buffer, width = VISUAL_WIDTH, height = VISUAL_HEIGHT, channels = 3): number[] {
  if (pixels.length < width * height * channels) throw new RangeError("Pixel buffer is smaller than width × height × channels");
  const [br, bg, bb] = estimateBackground(pixels, width, height, channels);

  const isForeground = new Uint8Array(width * height);
  let foreground = 0;
  for (let p = 0; p < width * height; p++) {
    const i = p * channels;
    const dr = pixels[i]! - br;
    const dg = pixels[i + 1]! - bg;
    const db = pixels[i + 2]! - bb;
    if (Math.sqrt(dr * dr + dg * dg + db * db) > FOREGROUND_DISTANCE) {
      isForeground[p] = 1;
      foreground++;
    }
  }
  const useAll = foreground / (width * height) < MIN_FOREGROUND_SHARE;

  const colors = new Array<number>(COLOR_BINS).fill(0);
  const shape = new Array<number>(SHAPE_BINS).fill(0);
  const cellW = width / GRID_COLS;
  const cellH = height / GRID_ROWS;
  let counted = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const fg = useAll || isForeground[p] === 1;
      if (!fg) continue;
      const i = p * channels;
      colors[colorBin(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!)]! += 1;
      counted++;
      if (!useAll) shape[Math.min(GRID_ROWS - 1, Math.floor(y / cellH)) * GRID_COLS + Math.min(GRID_COLS - 1, Math.floor(x / cellW))]! += 1;
    }
  }

  const cellArea = cellW * cellH;
  const round = (n: number) => Math.round(n * 10_000) / 10_000;
  return [...colors.map((c) => round(counted > 0 ? c / counted : 0)), ...shape.map((s) => round(useAll ? 0 : s / cellArea))];
}

const COLOR_WEIGHT = 0.7;

/** 0–1. Histogram intersection on colour, 1 − mean absolute difference on silhouette. */
export function visualSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== VISUAL_VECTOR_LENGTH || b.length !== VISUAL_VECTOR_LENGTH) return 0;
  let intersection = 0;
  for (let i = 0; i < COLOR_BINS; i++) intersection += Math.min(a[i]!, b[i]!);
  let shapeA = 0;
  let shapeB = 0;
  let diff = 0;
  for (let i = COLOR_BINS; i < VISUAL_VECTOR_LENGTH; i++) {
    shapeA += a[i]!;
    shapeB += b[i]!;
    diff += Math.abs(a[i]! - b[i]!);
  }
  // A full-bleed image has no silhouette — judge it on colour alone.
  if (shapeA === 0 || shapeB === 0) return Math.min(1, intersection);
  const shapeSimilarity = 1 - diff / SHAPE_BINS;
  return Math.min(1, COLOR_WEIGHT * intersection + (1 - COLOR_WEIGHT) * shapeSimilarity);
}

/** Lowercased word tokens (Latin and Bangla letters incl. vowel signs, digits), deduplicated, short stop-words dropped. */
export function tagTokens(values: readonly (string | null | undefined)[]): Set<string> {
  const tokens = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    for (const token of value.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u)) {
      if (token.length >= 3 && !STOP_WORDS.has(token)) tokens.add(token);
    }
  }
  return tokens;
}

const STOP_WORDS = new Set(["the", "and", "with", "for", "men", "women", "mens", "womens"]);

/** Jaccard overlap of two token sets, 0–1. */
export function tagSimilarity(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * Final ranking score. Without AI tags it's the pixel similarity alone;
 * with them, text agreement (garment type, colours, pattern) gets 40% —
 * enough to keep a navy panjabi above a navy saree, not enough for a tag
 * match to beat a clearly different photo.
 */
export function combinedScore(visual: number, tags: number | null): number {
  if (tags === null) return Math.round(visual * 10_000) / 10_000;
  return Math.round((0.6 * visual + 0.4 * tags) * 10_000) / 10_000;
}
