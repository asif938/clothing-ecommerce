/**
 * SMS length/segment counter (docs/PROJECT_SPEC.md §6.11: "SMS length
 * counter (GSM-7 vs Unicode for Bangla), with segment count and estimated
 * cost"). Approximates the real GSM 03.38 encoding rule — every character
 * in the basic set below counts as one septet; anything outside it
 * (including Bangla) forces the whole message into UCS-2, which halves the
 * per-segment limit. This intentionally does not model the GSM 03.38
 * *extended* charset (a handful of Latin symbols that cost two septets each,
 * e.g. `{`, `}`, `€`) — none of those appear in Bangla/English commerce
 * copy, and modeling them precisely would add real complexity for no
 * practical benefit here.
 */
const GSM7_BASIC_CHARS =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_BASIC_SET = new Set(GSM7_BASIC_CHARS);

const GSM7_SINGLE_SEGMENT_LIMIT = 160;
const GSM7_MULTI_SEGMENT_LIMIT = 153;
const UNICODE_SINGLE_SEGMENT_LIMIT = 70;
const UNICODE_MULTI_SEGMENT_LIMIT = 67;

export function isGsm7Text(text: string): boolean {
  for (const ch of text) {
    if (!GSM7_BASIC_SET.has(ch)) return false;
  }
  return true;
}

export interface SmsLengthEstimate {
  encoding: "gsm7" | "unicode";
  characters: number;
  segments: number;
}

export function estimateSmsLength(text: string): SmsLengthEstimate {
  const unicode = !isGsm7Text(text);
  const characters = text.length;
  const singleLimit = unicode ? UNICODE_SINGLE_SEGMENT_LIMIT : GSM7_SINGLE_SEGMENT_LIMIT;
  const multiLimit = unicode ? UNICODE_MULTI_SEGMENT_LIMIT : GSM7_MULTI_SEGMENT_LIMIT;
  const segments = characters === 0 ? 0 : characters <= singleLimit ? 1 : Math.ceil(characters / multiLimit);
  return { encoding: unicode ? "unicode" : "gsm7", characters, segments };
}

export function estimateSmsCostPoisha(text: string, costPerSegmentPoisha: number): number {
  return estimateSmsLength(text).segments * costPerSegmentPoisha;
}
