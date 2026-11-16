/**
 * Pure helpers for the Integrations form: turn a driver's field descriptors
 * (from `GET /admin/providers/catalog`, derived from the driver's zod schema)
 * into form values and back into a config object. The server re-validates
 * with the real schema; this only gives early, per-field messages.
 */
export type ConfigFieldKind = "text" | "secret" | "number" | "boolean" | "select" | "json";

export interface ConfigField {
  key: string;
  kind: ConfigFieldKind;
  required: boolean;
  nullable: boolean;
  defaultValue?: unknown;
  options?: string[];
  format?: "url" | "email";
  integer?: boolean;
  multiline?: boolean;
  min?: number;
  max?: number;
}

export type FormValues = Record<string, string | boolean>;
export type FieldErrorCode = "required" | "number" | "integer" | "min" | "max" | "url" | "email" | "json" | "option";

/** Form values for a new instance (driver defaults) or an existing one (its masked config; secrets start blank). */
export function initialValues(fields: ConfigField[], config?: Record<string, unknown>): FormValues {
  const values: FormValues = {};
  for (const field of fields) {
    const source = config && field.key in config ? config[field.key] : field.defaultValue;
    if (field.kind === "boolean") {
      values[field.key] = source === true;
    } else if (field.kind === "secret") {
      values[field.key] = config ? "" : typeof source === "string" ? source : "";
    } else if (field.kind === "json") {
      values[field.key] = source === undefined || source === null ? "" : JSON.stringify(source, null, 2);
    } else {
      values[field.key] = source === undefined || source === null ? "" : String(source);
    }
  }
  return values;
}

/** `cloudName` → `Cloud name`, `apiKey` → `API key`, `smtp_host` → `Smtp host`. */
export function humanizeKey(key: string): string {
  const words = key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (["api", "url", "id", "sms", "pem", "ms", "smtp"].includes(w) ? w.toUpperCase() : w));
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Build the config to send. `editing`: a blank secret means "keep the stored
 * value" (the API merges it back), so it is left out instead of failing.
 */
export function buildConfig(
  fields: ConfigField[],
  values: FormValues,
  editing: boolean,
): { config: Record<string, unknown>; errors: Record<string, FieldErrorCode> } {
  const config: Record<string, unknown> = {};
  const errors: Record<string, FieldErrorCode> = {};

  for (const field of fields) {
    const raw = values[field.key];
    if (field.kind === "boolean") {
      config[field.key] = raw === true;
      continue;
    }
    const text = typeof raw === "string" ? raw.trim() : "";
    if (text === "") {
      if (field.kind === "secret" && editing) continue;
      if (field.required) errors[field.key] = "required";
      else if (field.nullable) config[field.key] = null;
      continue;
    }
    switch (field.kind) {
      case "number": {
        const n = Number(text);
        if (!Number.isFinite(n)) errors[field.key] = "number";
        else if (field.integer && !Number.isInteger(n)) errors[field.key] = "integer";
        else if (field.min !== undefined && n < field.min) errors[field.key] = "min";
        else if (field.max !== undefined && n > field.max) errors[field.key] = "max";
        else config[field.key] = n;
        break;
      }
      case "select":
        if (field.options && !field.options.includes(text)) errors[field.key] = "option";
        else config[field.key] = text;
        break;
      case "json":
        try {
          config[field.key] = JSON.parse(text);
        } catch {
          errors[field.key] = "json";
        }
        break;
      default:
        if (field.format === "url" && !/^https?:\/\/\S+$/i.test(text)) errors[field.key] = "url";
        else if (field.format === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) errors[field.key] = "email";
        // Multi-line secrets (PEM keys) keep their line breaks.
        else config[field.key] = field.multiline ? (raw as string) : text;
    }
  }
  return { config, errors };
}
