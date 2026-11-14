"use client";

/**
 * Thin fetch wrapper for the admin app's client components. Calls go to
 * this app's own origin (`/api/v1/...`), which `next.config.mjs` rewrites
 * server-side to the real API — see that file for why. `credentials:
 * "include"` carries the httpOnly session cookie automatically.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "include",
    // JSON bodies only: for a FormData upload the browser must set `multipart/form-data` (with its boundary) itself —
    // forcing `application/json` there made every admin file upload (media, catalog import) unparseable server-side.
    headers: { ...(typeof init?.body === "string" ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });

  if (response.status === 204) return undefined as T;

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const message = (body && typeof body === "object" && "message" in body ? String(body.message) : null) ?? response.statusText;
    const code = body && typeof body === "object" && "code" in body ? String(body.code) : undefined;
    throw new ApiError(message, response.status, code, body);
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) => request<T>(path, { method: "POST", body: data !== undefined ? JSON.stringify(data) : undefined }),
  put: <T>(path: string, data?: unknown) => request<T>(path, { method: "PUT", body: data !== undefined ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) => request<T>(path, { method: "PATCH", body: data !== undefined ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: "POST", body: formData }),
};
