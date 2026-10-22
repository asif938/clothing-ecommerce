"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card } from "../../../../components/ui";

type LocalizedText = { bn?: string; en?: string };

interface SettingWidget {
  widget: "money" | "text" | "textarea" | "localizedText" | "select" | "toggle" | "color" | "image" | "json" | "code";
  options?: { value: string; label: LocalizedText }[];
}

interface SettingRow {
  key: string;
  group: string;
  label: LocalizedText;
  help: LocalizedText | null;
  secret: boolean;
  public: boolean;
  permission: string;
  ui: SettingWidget;
  value: unknown;
  isOverridden: boolean;
}

function labelOf(text: LocalizedText | null | undefined): string {
  return text?.en ?? text?.bn ?? "";
}

function SettingField({ setting, onSaved }: { setting: SettingRow; onSaved: () => void }) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [value, setValue] = useState<unknown>(setting.value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(nextValue: unknown) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.patch(`/admin/settings/${setting.key}`, { value: nextValue });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  const widget = setting.ui.widget;
  const label = labelOf(setting.label) || setting.key;

  let control: React.ReactNode;
  if (setting.secret) {
    control = (
      <div className="flex items-center gap-2">
        <span className="rounded-theme border border-border bg-muted px-3 py-2 text-sm">{String(setting.value ?? "")}</span>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            const next = window.prompt(t("secretReplace"));
            if (next !== null) void save(next);
          }}
        >
          {t("secretReplace")}
        </Button>
      </div>
    );
  } else if (widget === "toggle") {
    control = (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => {
          setValue(e.target.checked);
          void save(e.target.checked);
        }}
      />
    );
  } else if (widget === "select") {
    control = (
      <select
        className="rounded-theme border border-border bg-surface px-3 py-2 text-sm"
        value={String(value ?? "")}
        onChange={(e) => {
          setValue(e.target.value);
          void save(e.target.value);
        }}
      >
        {setting.ui.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {labelOf(option.label) || option.value}
          </option>
        ))}
      </select>
    );
  } else if (widget === "color") {
    control = (
      <input type="color" value={String(value ?? "#000000")} onChange={(e) => { setValue(e.target.value); void save(e.target.value); }} />
    );
  } else if (widget === "localizedText") {
    const lt = (value as LocalizedText) ?? {};
    control = (
      <div className="flex flex-col gap-2">
        <input
          className="rounded-theme border border-border bg-surface px-3 py-2 text-sm"
          placeholder="বাংলা"
          defaultValue={lt.bn ?? ""}
          onBlur={(e) => void save({ ...lt, bn: e.target.value })}
        />
        <input
          className="rounded-theme border border-border bg-surface px-3 py-2 text-sm"
          placeholder="English"
          defaultValue={lt.en ?? ""}
          onBlur={(e) => void save({ ...lt, en: e.target.value })}
        />
      </div>
    );
  } else if (widget === "json") {
    control = (
      <textarea
        className="h-24 w-full rounded-theme border border-border bg-surface px-3 py-2 font-mono text-xs"
        defaultValue={JSON.stringify(value ?? null, null, 2)}
        onBlur={(e) => {
          try {
            void save(JSON.parse(e.target.value));
          } catch {
            setError("Invalid JSON");
          }
        }}
      />
    );
  } else if (widget === "textarea" || widget === "code") {
    control = (
      <textarea
        className="h-24 w-full rounded-theme border border-border bg-surface px-3 py-2 text-sm"
        defaultValue={String(value ?? "")}
        onBlur={(e) => void save(e.target.value)}
      />
    );
  } else {
    control = (
      <input
        className="w-full rounded-theme border border-border bg-surface px-3 py-2 text-sm"
        defaultValue={value === null || value === undefined ? "" : String(value)}
        onBlur={(e) => {
          const raw = e.target.value;
          const coerced = typeof setting.value === "number" ? Number(raw) : raw;
          void save(coerced);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1 border-b border-border py-4 last:border-b-0">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-surface-foreground">{label}</span>
        {busy && <span className="text-xs text-surface-foreground/50">{tCommon("loading")}</span>}
        {saved && !busy && <span className="text-xs text-success">{t("saved")}</span>}
      </div>
      {setting.help && <p className="text-xs text-surface-foreground/60">{labelOf(setting.help)}</p>}
      {control}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

export default function SettingsPage() {
  const t = useTranslations("settings");
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const result = await api.get<{ groups: string[]; settings: SettingRow[] }>("/admin/settings");
      setSettings(result.settings);
      setGroups(result.groups);
      setActiveGroup((prev) => prev ?? result.groups[0] ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load settings");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() is also reused to refetch after mutations below, so it must stay a named async function, not inline .then() chaining.
    void load();
  }, []);

  const visible = useMemo(() => settings.filter((s) => s.group === activeGroup), [settings, activeGroup]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      {error && (
        <div className="mt-4">
          <Banner kind="error">{error}</Banner>
        </div>
      )}
      <div className="mt-6 flex gap-6">
        <nav className="flex w-40 flex-col gap-1">
          {groups.map((group) => (
            <button
              key={group}
              onClick={() => setActiveGroup(group)}
              className={`rounded-theme px-3 py-2 text-left text-sm capitalize ${
                activeGroup === group ? "bg-brand text-brand-foreground" : "text-surface-foreground hover:bg-muted"
              }`}
            >
              {group}
            </button>
          ))}
        </nav>
        <Card className="flex-1">
          {visible.map((setting) => (
            <SettingField key={setting.key} setting={setting} onSaved={load} />
          ))}
          {visible.length === 0 && <p className="text-sm text-surface-foreground/60">—</p>}
        </Card>
      </div>
    </div>
  );
}
