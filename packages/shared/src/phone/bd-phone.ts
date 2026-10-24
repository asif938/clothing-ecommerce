/**
 * Bangladesh phone numbers (docs/PROJECT_SPEC.md §6.2). Accepts
 * `01XXXXXXXXX`, `+8801XXXXXXXXX`, `8801XXXXXXXXX`, with spaces/dashes and
 * Bangla digits; normalizes to E.164 `+8801XXXXXXXXX`. The operator-prefix
 * digit (3rd digit after "01") is kept here as a literal `[3-9]` per the
 * spec's own regex rather than a settings-editable list — see
 * docs/DECISIONS.md (the "operator prefix list kept in settings" idea adds
 * a settings read to every phone validation for a list that hasn't changed
 * in practice; revisit if a new operator prefix is ever assigned).
 */

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

function banglaDigitsToLatin(input: string): string {
  return input.replace(/[০-৯]/g, (ch) => String(BANGLA_DIGITS.indexOf(ch)));
}

const BD_E164_PATTERN = /^\+8801[3-9]\d{8}$/;

/** Returns the E.164 form (`+8801XXXXXXXXX`), or null if the input isn't a recognizable BD mobile number. */
export function normalizeBdPhone(input: string): string | null {
  if (!input) return null;
  let digits = banglaDigitsToLatin(input).replace(/[\s-]/g, "");
  digits = digits.replace(/^\+/, "");
  if (digits.startsWith("880")) {
    digits = `+${digits}`;
  } else if (digits.startsWith("01")) {
    digits = `+88${digits}`;
  } else {
    return null;
  }
  return BD_E164_PATTERN.test(digits) ? digits : null;
}

export function isValidBdPhone(input: string): boolean {
  return normalizeBdPhone(input) !== null;
}

/** Display format setting default `01XXX-XXXXXX` (§17) — takes an already-normalized E.164 number. */
export function formatBdPhoneDisplay(e164: string): string {
  const local = e164.replace("+880", "0");
  if (local.length !== 11) return e164;
  return `${local.slice(0, 5)}-${local.slice(5)}`;
}

/** Masked for restricted staff per §6.2: `017XX-XXX123`. */
export function maskBdPhoneDisplay(e164: string): string {
  const local = e164.replace("+880", "0");
  if (local.length !== 11) return e164;
  return `${local.slice(0, 5)}-XXX${local.slice(8)}`;
}
