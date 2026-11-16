"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "../../../../i18n/navigation";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField, Toggle } from "../../../../components/ui";
import { buildConfig, humanizeKey, initialValues, type ConfigField, type FieldErrorCode, type FormValues } from "../../../../lib/provider-form";

// The env-configured default (local/s3) isn't managed here — see
// docs/DECISIONS.md. "storage" only lists *alternative* storage providers
// (Cloudinary) that an admin can switch to via the `media.defaultProvider`
// setting. Every capability with drivers in the shared catalog needs a tab
// here (M8 bugfix: tabs were once missing for capabilities that had drivers).
const CAPABILITIES = ["storage", "email", "sms", "whatsapp", "payment", "courier", "captcha", "fraud_check", "tracking", "ai", "audience", "chat_channel", "telephony"] as const;

interface DriverCatalogEntry {
  capability: string;
  driver: string;
  label: { bn?: string; en?: string };
  secretFields: string[];
  fields: ConfigField[];
  supportsUsage: boolean;
}

interface ProviderInstance {
  id: string;
  capability: string;
  driver: string;
  name: string;
  enabled: boolean;
  isDefault: boolean;
  mode: "sandbox" | "live";
  config: Record<string, unknown>;
}

interface EditorState {
  /** null = creating a new instance. */
  instanceId: string | null;
  driver: string;
  name: string;
  mode: "sandbox" | "live";
  enabled: boolean;
  isDefault: boolean;
  values: FormValues;
  /** Masked secret values of the instance being edited, shown as hints. */
  maskedSecrets: Record<string, string>;
}

export default function IntegrationsPage() {
  const t = useTranslations("integrations");
  const locale = useLocale();
  const [capability, setCapability] = useState<string>(CAPABILITIES[0]);
  const [catalog, setCatalog] = useState<DriverCatalogEntry[]>([]);
  const [instances, setInstances] = useState<ProviderInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [usage, setUsage] = useState<Record<string, { supported: boolean; usedPercent?: number }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, FieldErrorCode>>({});
  const [nameError, setNameError] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [catalogResult, instancesResult] = await Promise.all([
        api.get<DriverCatalogEntry[]>(`/admin/providers/catalog?capability=${capability}`),
        api.get<ProviderInstance[]>(`/admin/providers?capability=${capability}`),
      ]);
      setCatalog(catalogResult);
      setInstances(instancesResult);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setEditor(null);
    setError(null);
    setNotice(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally reruns only when the capability tab changes
  }, [capability]);

  const driverOf = (driver: string) => catalog.find((d) => d.driver === driver);
  const driverLabel = (driver: string) => {
    const entry = driverOf(driver);
    return (locale === "bn" ? entry?.label.bn : entry?.label.en) ?? entry?.label.en ?? driver;
  };
  const fieldLabel = (key: string) => (t.has(`fields.${key}`) ? t(`fields.${key}`) : humanizeKey(key));
  const capabilityLabel = (cap: string) => (t.has(`capabilities.${cap}`) ? t(`capabilities.${cap}`) : humanizeKey(cap));

  function startCreate(entry: DriverCatalogEntry) {
    setFieldErrors({});
    setNameError(false);
    setNotice(null);
    setEditor({
      instanceId: null,
      driver: entry.driver,
      name: (locale === "bn" ? entry.label.bn : entry.label.en) ?? entry.label.en ?? entry.driver,
      mode: "sandbox",
      enabled: true,
      isDefault: instances.length === 0,
      values: initialValues(entry.fields),
      maskedSecrets: {},
    });
  }

  function startEdit(instance: ProviderInstance) {
    const entry = driverOf(instance.driver);
    setFieldErrors({});
    setNameError(false);
    setNotice(null);
    const maskedSecrets: Record<string, string> = {};
    for (const key of entry?.secretFields ?? []) {
      const value = instance.config[key];
      if (typeof value === "string" && value) maskedSecrets[key] = value;
    }
    setEditor({
      instanceId: instance.id,
      driver: instance.driver,
      name: instance.name,
      mode: instance.mode,
      enabled: instance.enabled,
      isDefault: instance.isDefault,
      values: initialValues(entry?.fields ?? [], instance.config),
      maskedSecrets,
    });
  }

  function setValue(key: string, value: string | boolean) {
    setEditor((prev) => (prev ? { ...prev, values: { ...prev.values, [key]: value } } : prev));
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function handleSave() {
    if (!editor) return;
    const entry = driverOf(editor.driver);
    if (!entry) return;
    const editing = editor.instanceId !== null;
    const { config, errors } = buildConfig(entry.fields, editor.values, editing);
    const missingName = editor.name.trim() === "";
    setFieldErrors(errors);
    setNameError(missingName);
    if (missingName || Object.keys(errors).length > 0) return;

    setError(null);
    setBusy("save");
    try {
      const common = { name: editor.name.trim(), mode: editor.mode, enabled: editor.enabled, isDefault: editor.isDefault, config };
      if (editing) {
        await api.patch(`/admin/providers/${editor.instanceId}`, common);
      } else {
        await api.post("/admin/providers", { capability, driver: editor.driver, ...common });
      }
      setEditor(null);
      setNotice(t("saved"));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("saveFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function handleToggle(instance: ProviderInstance, enabled: boolean) {
    setBusy(instance.id);
    setError(null);
    try {
      await api.patch(`/admin/providers/${instance.id}`, { enabled });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("saveFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(instance: ProviderInstance) {
    if (!window.confirm(t("deleteConfirm", { name: instance.name }))) return;
    setBusy(instance.id);
    setError(null);
    try {
      await api.delete(`/admin/providers/${instance.id}`);
      if (editor?.instanceId === instance.id) setEditor(null);
      setNotice(t("deleted"));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("deleteFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function handleTest(id: string) {
    setBusy(`test:${id}`);
    try {
      const result = await api.post<{ ok: boolean; message: string }>(`/admin/providers/${id}/test-connection`);
      setResults((prev) => ({ ...prev, [id]: result }));
    } catch (err) {
      setResults((prev) => ({ ...prev, [id]: { ok: false, message: err instanceof ApiError ? err.message : t("testFailure") } }));
    } finally {
      setBusy(null);
    }
  }

  async function handleCheckUsage(id: string) {
    setBusy(`usage:${id}`);
    try {
      const result = await api.get<{ supported: boolean; usedPercent?: number }>(`/admin/providers/${id}/usage`);
      setUsage((prev) => ({ ...prev, [id]: result }));
    } catch {
      setUsage((prev) => ({ ...prev, [id]: { supported: false } }));
    } finally {
      setBusy(null);
    }
  }

  const editorEntry = editor ? driverOf(editor.driver) : undefined;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      <p className="mt-1 text-sm text-surface-foreground/60">{t("subtitle")}</p>

      <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label={t("title")}>
        {CAPABILITIES.map((cap) => (
          <button
            key={cap}
            type="button"
            role="tab"
            aria-selected={capability === cap}
            onClick={() => setCapability(cap)}
            className={`shrink-0 whitespace-nowrap rounded-theme px-3 py-1.5 text-sm ${
              capability === cap ? "bg-brand text-brand-foreground" : "bg-muted text-surface-foreground"
            }`}
          >
            {capabilityLabel(cap)}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {error && <Banner kind="error">{error}</Banner>}
        {notice && <Banner kind="success">{notice}</Banner>}
        {t.has(`capabilityHelp.${capability}`) && (
          <Banner kind="info">
            {t(`capabilityHelp.${capability}`)}
            {capability === "storage" && (
              <>
                {" "}
                <Link href="/settings" className="font-medium underline">
                  {t("openSettings")}
                </Link>
              </>
            )}
          </Banner>
        )}
      </div>

      <Card className="mt-4">
        <h2 className="text-base font-semibold text-surface-foreground">{t("configured")}</h2>
        {loading ? (
          <p className="mt-3 text-sm text-surface-foreground/60">{t("loading")}</p>
        ) : instances.length === 0 ? (
          <p className="mt-3 text-sm text-surface-foreground/60">{t("empty")}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {instances.map((instance) => {
              const supportsUsage = driverOf(instance.driver)?.supportsUsage ?? false;
              const result = results[instance.id];
              const used = usage[instance.id];
              return (
                <li key={instance.id} className="rounded-theme border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-surface-foreground">{instance.name}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-surface-foreground/70">{driverLabel(instance.driver)}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${instance.mode === "live" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}
                        >
                          {t(`modes.${instance.mode}`)}
                        </span>
                        {instance.isDefault && <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs text-brand">{t("primaryBadge")}</span>}
                        {instance.config.mock === true && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-surface-foreground/70">{t("mockBadge")}</span>}
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-surface-foreground/80">
                      <Toggle checked={instance.enabled} disabled={busy === instance.id} onChange={(v) => void handleToggle(instance, v)} />
                      {instance.enabled ? t("enabled") : t("disabled")}
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => startEdit(instance)}>
                      {t("edit")}
                    </Button>
                    <Button variant="secondary" disabled={busy === `test:${instance.id}`} onClick={() => void handleTest(instance.id)}>
                      {busy === `test:${instance.id}` ? t("testing") : t("testConnection")}
                    </Button>
                    {supportsUsage && (
                      <Button variant="secondary" disabled={busy === `usage:${instance.id}`} onClick={() => void handleCheckUsage(instance.id)}>
                        {t("checkUsage")}
                      </Button>
                    )}
                    <Button variant="danger" disabled={busy === instance.id} onClick={() => void handleDelete(instance)}>
                      {t("delete")}
                    </Button>
                  </div>
                  {result && (
                    <p className={`mt-2 text-xs ${result.ok ? "text-success" : "text-danger"}`}>
                      {result.ok ? t("testSuccess") : t("testFailure")}: {result.message}
                    </p>
                  )}
                  {used && !used.supported && <p className="mt-2 text-xs text-surface-foreground/60">{t("usageUnavailable")}</p>}
                  {used?.supported && (
                    <p className={`mt-2 text-xs ${(used.usedPercent ?? 0) >= 80 ? "text-danger" : "text-surface-foreground/60"}`}>
                      {t("usagePercent", { percent: (used.usedPercent ?? 0).toFixed(1) })}
                      {(used.usedPercent ?? 0) >= 95 && ` — ${t("usageFallbackActive")}`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-5 border-t border-border pt-4">
          <h2 className="text-base font-semibold text-surface-foreground">{t("addNew")}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {catalog.map((entry) => (
              <Button
                key={entry.driver}
                variant={editor && !editor.instanceId && editor.driver === entry.driver ? "primary" : "secondary"}
                onClick={() => startCreate(entry)}
              >
                + {(locale === "bn" ? entry.label.bn : entry.label.en) ?? entry.label.en ?? entry.driver}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {editor && editorEntry && (
        <Card className="mt-4">
          <h2 className="text-base font-semibold text-surface-foreground">
            {editor.instanceId ? t("editTitle", { driver: driverLabel(editor.driver) }) : t("createTitle", { driver: driverLabel(editor.driver) })}
          </h2>
          <form
            className="mt-4 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave();
            }}
          >
            <TextField
              label={t("name")}
              value={editor.name}
              onChange={(e) => {
                const name = e.target.value;
                setEditor((prev) => (prev ? { ...prev, name } : prev));
                setNameError(false);
              }}
              error={nameError ? t("errors.required") : undefined}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-surface-foreground">{t("mode")}</span>
                <select
                  className="rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground"
                  value={editor.mode}
                  onChange={(e) => {
                    const mode = e.target.value === "live" ? "live" : "sandbox";
                    setEditor((prev) => (prev ? { ...prev, mode } : prev));
                  }}
                >
                  <option value="sandbox">{t("modes.sandbox")}</option>
                  <option value="live">{t("modes.live")}</option>
                </select>
              </label>
              <div className="flex items-center gap-3 text-sm text-surface-foreground">
                <Toggle checked={editor.enabled} onChange={(enabled) => setEditor((prev) => (prev ? { ...prev, enabled } : prev))} />
                {t("enabled")}
              </div>
              <div className="flex items-center gap-3 text-sm text-surface-foreground">
                <Toggle checked={editor.isDefault} onChange={(isDefault) => setEditor((prev) => (prev ? { ...prev, isDefault } : prev))} />
                {t("primary")}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-surface-foreground">{t("settingsHeading")}</h3>
              {editorEntry.fields.length === 0 && <p className="mt-2 text-sm text-surface-foreground/60">{t("noSettings")}</p>}
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {editorEntry.fields.map((field) => (
                  <ConfigInput
                    key={field.key}
                    field={field}
                    label={fieldLabel(field.key)}
                    value={editor.values[field.key]}
                    onChange={(v) => setValue(field.key, v)}
                    error={fieldErrors[field.key] ? t(`errors.${fieldErrors[field.key]}`) : undefined}
                    hint={
                      field.kind === "secret" && editor.instanceId && editor.maskedSecrets[field.key]
                        ? t("secretKeep", { masked: editor.maskedSecrets[field.key] ?? "" })
                        : t.has(`hints.${field.key}`)
                          ? t(`hints.${field.key}`)
                          : undefined
                    }
                    optionalLabel={t("optional")}
                    defaultHint={(value) => t("defaultValue", { value })}
                    yes={t("yes")}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy === "save"}>
                {busy === "save" ? t("saving") : t("save")}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditor(null)}>
                {t("cancel")}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}

function ConfigInput({
  field,
  label,
  value,
  onChange,
  error,
  hint,
  optionalLabel,
  defaultHint,
  yes,
}: {
  field: ConfigField;
  label: string;
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
  error?: string;
  hint?: string;
  optionalLabel: string;
  defaultHint: (value: string) => string;
  yes: string;
}) {
  const id = `cfg-${field.key}`;
  const inputClass = `w-full rounded-theme border bg-surface px-3 py-2 text-sm text-surface-foreground outline-none focus:border-brand ${
    error ? "border-danger" : "border-border"
  }`;
  const showDefault =
    field.kind !== "boolean" && field.kind !== "secret" && field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== "";
  const defaultText = typeof field.defaultValue === "object" ? JSON.stringify(field.defaultValue) : String(field.defaultValue);

  const labelRow = (
    <span className="flex items-baseline gap-1 font-medium text-surface-foreground">
      {label}
      {field.required ? <span className="text-danger" aria-hidden>*</span> : <span className="text-xs font-normal text-surface-foreground/50">({optionalLabel})</span>}
    </span>
  );
  const help = (
    <>
      {hint && <span className="text-xs text-surface-foreground/60">{hint}</span>}
      {showDefault && !hint && <span className="text-xs text-surface-foreground/50">{defaultHint(defaultText)}</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </>
  );

  if (field.kind === "boolean") {
    return (
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-surface-foreground">{label}</span>
        <div className="flex items-center gap-3">
          <Toggle checked={value === true} onChange={onChange} />
          <span className="text-surface-foreground/70">{value === true ? yes : "—"}</span>
        </div>
        {help}
      </div>
    );
  }

  const text = typeof value === "string" ? value : "";
  const wide = field.kind === "json" || field.multiline;

  return (
    <label htmlFor={id} className={`flex flex-col gap-1 text-sm ${wide ? "sm:col-span-2" : ""}`}>
      {labelRow}
      {field.kind === "select" ? (
        <select id={id} className={inputClass} value={text} onChange={(e) => onChange(e.target.value)}>
          {!field.required && <option value="">—</option>}
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : wide ? (
        <textarea
          id={id}
          className={`${inputClass} h-32 font-mono text-xs`}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
      ) : (
        <input
          id={id}
          className={inputClass}
          type={field.kind === "secret" ? "password" : field.kind === "number" ? "number" : field.format === "url" ? "url" : field.format === "email" ? "email" : "text"}
          inputMode={field.kind === "number" ? "decimal" : undefined}
          autoComplete={field.kind === "secret" ? "new-password" : "off"}
          spellCheck={false}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {help}
    </label>
  );
}
