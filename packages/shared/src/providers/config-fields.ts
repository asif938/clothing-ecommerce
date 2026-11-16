import { z } from "zod";
import type { ProviderDriverDefinition } from "./types.ts";

/**
 * Form descriptors for a driver's config, derived from its zod
 * `configSchema` so the admin Integrations screen can render one input per
 * field instead of a raw JSON box — and stays correct as drivers are added,
 * with no per-driver UI code (docs/DECISIONS.md, 2026-11-15).
 *
 * Uses zod's JSON Schema export on the *input* side (what an admin types,
 * before any `.transform()`), so defaults and optional fields read the way
 * the form needs them. Anything that is not a scalar (records such as the
 * generic HTTP SMS `params` map) falls back to a small JSON editor.
 */
export type ConfigFieldKind = "text" | "secret" | "number" | "boolean" | "select" | "json";

export interface ConfigFieldDescriptor {
  key: string;
  kind: ConfigFieldKind;
  required: boolean;
  nullable: boolean;
  defaultValue?: unknown;
  options?: string[];
  format?: "url" | "email";
  integer?: boolean;
  /** PEM keys and similar — rendered as a textarea. */
  multiline?: boolean;
  min?: number;
  max?: number;
}

type JsonSchemaNode = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  anyOf?: JsonSchemaNode[];
  oneOf?: JsonSchemaNode[];
  default?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
};

function unwrapNullable(node: JsonSchemaNode): { node: JsonSchemaNode; nullable: boolean } {
  const variants = node.anyOf ?? node.oneOf;
  if (!variants) {
    if (Array.isArray(node.type) && node.type.includes("null")) {
      const rest = node.type.filter((t) => t !== "null");
      return { node: { ...node, type: rest.length === 1 ? rest[0] : rest }, nullable: true };
    }
    return { node, nullable: false };
  }
  const nonNull = variants.filter((v) => v.type !== "null");
  const nullable = nonNull.length !== variants.length;
  if (nonNull.length === 1) return { node: { ...nonNull[0], default: node.default ?? nonNull[0]?.default }, nullable };
  // Unions of literals (z.literal("a").or(...)) read as a select.
  if (nonNull.every((v) => v.const !== undefined)) {
    return { node: { enum: nonNull.map((v) => v.const), default: node.default }, nullable };
  }
  return { node: { ...node, anyOf: undefined, oneOf: undefined }, nullable };
}

function describeNode(key: string, raw: JsonSchemaNode, required: boolean, secretFields: string[]): ConfigFieldDescriptor {
  const { node, nullable } = unwrapNullable(raw);
  const base = { key, required: required && node.default === undefined && !nullable, nullable, defaultValue: node.default };
  if (node.enum) return { ...base, kind: "select", options: node.enum.map(String) };
  if (node.const !== undefined) return { ...base, kind: "select", options: [String(node.const)] };
  switch (node.type) {
    case "boolean":
      return { ...base, kind: "boolean" };
    case "number":
    case "integer":
      return {
        ...base,
        kind: "number",
        integer: node.type === "integer",
        ...(node.minimum !== undefined ? { min: node.minimum } : {}),
        ...(node.maximum !== undefined ? { max: node.maximum } : {}),
      };
    case "string":
      return {
        ...base,
        kind: secretFields.includes(key) ? "secret" : "text",
        ...(/pem$/i.test(key) ? { multiline: true } : {}),
        ...(node.format === "uri" || node.format === "url" ? { format: "url" as const } : {}),
        ...(node.format === "email" ? { format: "email" as const } : {}),
      };
    default:
      return { ...base, kind: "json" };
  }
}

export function describeConfigFields(definition: Pick<ProviderDriverDefinition, "configSchema" | "secretFields">): ConfigFieldDescriptor[] {
  let schema: JsonSchemaNode;
  try {
    schema = z.toJSONSchema(definition.configSchema, { io: "input", unrepresentable: "any" }) as JsonSchemaNode;
  } catch {
    return [];
  }
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  return Object.entries(properties).map(([key, node]) => describeNode(key, node, required.has(key), definition.secretFields));
}
