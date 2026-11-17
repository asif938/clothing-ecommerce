/**
 * The API's error bodies are `{ code, message }` (Nest's HttpException with
 * an object payload), not `{ error: { code, message } }`. Reading only the
 * wrapped form meant every API error — empty cart, missing address, blocked
 * order — reached shoppers as the generic fallback. Accept both shapes.
 */
export function apiErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const wrapped = (body as { error?: unknown }).error;
    if (wrapped && typeof wrapped === "object" && typeof (wrapped as { message?: unknown }).message === "string") {
      return (wrapped as { message: string }).message;
    }
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
    if (Array.isArray(message) && typeof message[0] === "string") return message[0];
  }
  return fallback;
}
