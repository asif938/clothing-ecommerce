/**
 * Variable substitution for message templates (docs/PROJECT_SPEC.md §6.11).
 * Deliberately simple `{variable}` replacement, not a templating engine —
 * the variable set is small, fixed, and documented per event
 * (`NOTIFICATION_EVENTS`); anything fancier (conditionals, loops) isn't
 * needed for order/OTP notifications. A variable with no value in the
 * supplied map is left as the literal `{placeholder}` rather than silently
 * blanked, so a missing/misnamed variable is obvious in a preview or a real
 * send instead of producing a message with a confusing gap.
 */
export function renderTemplate(template: string, variables: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = variables[key];
    return value === undefined || value === null ? match : String(value);
  });
}

export function formatTakaFromPoisha(poisha: number): string {
  const taka = poisha / 100;
  const formatted = Number.isInteger(taka) ? taka.toString() : taka.toFixed(2);
  return `৳${formatted}`;
}
