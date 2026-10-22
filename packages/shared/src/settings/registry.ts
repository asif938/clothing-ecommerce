import type { z } from "zod";
import type { LocalizedText } from "../i18n/localized-text.ts";
import { isKnownPermission } from "../permissions/index.ts";

/** docs/PROJECT_SPEC.md §4.1 — widgets the generated admin Settings UI knows how to render. */
export type SettingWidget =
  | "money"
  | "text"
  | "textarea"
  | "localizedText"
  | "select"
  | "toggle"
  | "color"
  | "image"
  | "json"
  | "code";

export interface SettingSelectOption {
  value: string;
  label: LocalizedText;
}

export interface SettingUi {
  widget: SettingWidget;
  options?: SettingSelectOption[];
}

export interface SettingDefinition<T = unknown> {
  key: string;
  group: string;
  type: z.ZodType<T>;
  default: T;
  label: LocalizedText;
  help?: LocalizedText;
  /** true => encrypted at rest, never sent to clients, write-only in admin UI. */
  secret?: boolean;
  /** true => included in the storefront's public `GET /store/config` payload. */
  public?: boolean;
  permission: string;
  ui: SettingUi;
}

const registry = new Map<string, SettingDefinition>();

export function defineSetting<T>(definition: SettingDefinition<T>): SettingDefinition<T> {
  if (registry.has(definition.key)) {
    throw new Error(`Setting "${definition.key}" is already defined`);
  }
  if (!isKnownPermission(definition.permission)) {
    throw new Error(`Setting "${definition.key}" references unknown permission "${definition.permission}"`);
  }
  registry.set(definition.key, definition as SettingDefinition);
  return definition;
}

export function getSettingDefinition(key: string): SettingDefinition | undefined {
  return registry.get(key);
}

export function listSettingDefinitions(): SettingDefinition[] {
  return [...registry.values()];
}

export function listPublicSettingDefinitions(): SettingDefinition[] {
  return listSettingDefinitions().filter((d) => d.public);
}

export function listSettingGroups(): string[] {
  return [...new Set(listSettingDefinitions().map((d) => d.group))];
}

export type SettingValidationResult =
  | { success: true; data: unknown }
  | { success: false; error: string };

export function validateSettingValue(key: string, value: unknown): SettingValidationResult {
  const definition = getSettingDefinition(key);
  if (!definition) {
    return { success: false, error: `Unknown setting "${key}"` };
  }
  const result = definition.type.safeParse(value);
  if (!result.success) {
    return { success: false, error: result.error.message };
  }
  return { success: true, data: result.data };
}

/** Test-only: definitions are normally registered once at module load and kept for the process lifetime. */
export function __resetRegistryForTests(): void {
  registry.clear();
}
