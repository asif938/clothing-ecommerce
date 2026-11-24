"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AD_PLATFORMS } from "@clothing/shared/settings";
import { Button } from "./ui";

const inputClass = "rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground";
const ASSISTANT_CHANNELS = ["live_chat", "whatsapp", "messenger", "instagram"] as const;
const SLA_PRIORITIES = ["urgent", "high", "normal", "low"] as const;
/** Mirrors `BOTTOM_NAV_ITEMS` in `@clothing/shared/settings`. */
const BOTTOM_NAV_TABS = ["home", "shop", "categories", "search", "wishlist", "cart", "account", "track"] as const;

/**
 * Plain inputs for the settings whose value is structured (stored as JSON).
 * Each known key gets its own small form; anything else falls back to the
 * JSON box. Money is shown in taka and stored in poisha (golden rule 3).
 */
export function JsonSettingEditor({ settingKey, value, onSave }: { settingKey: string; value: unknown; onSave: (next: unknown) => void }) {
  const t = useTranslations("settings.json");

  if (settingKey === "support.assistant.channels") {
    const chosen = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="flex flex-wrap gap-4">
        {ASSISTANT_CHANNELS.map((channel) => (
          <label key={channel} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={chosen.includes(channel)}
              onChange={() => onSave(chosen.includes(channel) ? chosen.filter((c) => c !== channel) : [...chosen, channel])}
            />
            {t(`channel_${channel}`)}
          </label>
        ))}
      </div>
    );
  }

  if (settingKey === "theme.bottomNav.items") {
    return <BottomNavTabs value={Array.isArray(value) ? (value as string[]) : []} onSave={onSave} />;
  }

  if (settingKey === "support.sla.firstResponseMinutes" || settingKey === "support.sla.resolutionMinutes") {
    return <SlaEditor value={(value ?? {}) as Record<string, number>} onSave={onSave} />;
  }

  if (settingKey === "giftCards.presets") {
    return <GiftCardPresets value={Array.isArray(value) ? (value as number[]) : []} onSave={onSave} />;
  }

  if (settingKey === "marketing.adSpend.utmSourceMap") {
    const map = (value ?? {}) as Record<string, string[]>;
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {AD_PLATFORMS.map((platform) => (
          <label key={platform} className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-surface-foreground/70">{t(`platform_${platform}`)}</span>
            <input
              className={inputClass}
              placeholder="facebook, fb, ig"
              defaultValue={(map[platform] ?? []).join(", ")}
              onBlur={(e) => {
                const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                const next = { ...map };
                if (list.length) next[platform] = list;
                else delete next[platform];
                onSave(next);
              }}
            />
          </label>
        ))}
        <span className="text-xs text-surface-foreground/60 sm:col-span-2">{t("utmHint")}</span>
      </div>
    );
  }

  return <RawJson value={value} onSave={onSave} />;
}

/** Five slots, left to right; empty slots are dropped. Saves on every change once at least two different tabs are chosen (the API validates again). */
function BottomNavTabs({ value, onSave }: { value: string[]; onSave: (next: unknown) => void }) {
  const t = useTranslations("settings.json");
  const [slots, setSlots] = useState<string[]>(() => Array.from({ length: 5 }, (_, i) => value[i] ?? ""));
  const chosen = slots.filter(Boolean);
  const valid = chosen.length >= 2 && new Set(chosen).size === chosen.length;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-5">
        {slots.map((slot, index) => (
          <label key={index} className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-surface-foreground/70">{t("tabSlot", { n: index + 1 })}</span>
            <select
              className={inputClass}
              value={slot}
              onChange={(e) => {
                const next = slots.map((s, i) => (i === index ? e.target.value : s));
                setSlots(next);
                const picked = next.filter(Boolean);
                if (picked.length >= 2 && new Set(picked).size === picked.length) onSave(picked);
              }}
            >
              <option value="">{t("tabNone")}</option>
              {BOTTOM_NAV_TABS.map((tab) => (
                <option key={tab} value={tab} disabled={tab !== slot && chosen.includes(tab)}>
                  {t(`tab_${tab}`)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <span className={`text-xs ${valid ? "text-surface-foreground/60" : "text-danger"}`}>{valid ? t("tabsHint") : t("tabsInvalid")}</span>
    </div>
  );
}

function SlaEditor({ value, onSave }: { value: Record<string, number>; onSave: (next: unknown) => void }) {
  const t = useTranslations("settings.json");
  const [draft, setDraft] = useState<Record<string, number>>(value);
  const valid = SLA_PRIORITIES.every((p) => Number(draft[p]) >= 5);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-4">
        {SLA_PRIORITIES.map((priority) => (
          <label key={priority} className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-surface-foreground/70">{t(`priority_${priority}`)}</span>
            <input type="number" min={5} className={inputClass} value={draft[priority] ?? ""} onChange={(e) => setDraft({ ...draft, [priority]: Math.round(Number(e.target.value)) })} />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" disabled={!valid} onClick={() => onSave(draft)}>
          {t("save")}
        </Button>
        <span className="text-xs text-surface-foreground/60">{valid ? t("slaHint") : t("slaMin")}</span>
      </div>
    </div>
  );
}

function GiftCardPresets({ value, onSave }: { value: number[]; onSave: (next: unknown) => void }) {
  const t = useTranslations("settings.json");
  const [text, setText] = useState(value.map((poisha) => poisha / 100).join(", "));
  const parsed = text.split(",").map((s) => s.trim()).filter(Boolean).map(Number);
  const valid = parsed.length <= 8 && parsed.every((n) => Number.isFinite(n) && n >= 1);
  return (
    <div className="flex flex-col gap-1">
      <input className={inputClass} placeholder="500, 1000, 2000, 5000" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => valid && onSave(parsed.map((taka) => Math.round(taka * 100)))} />
      <span className={`text-xs ${valid ? "text-surface-foreground/60" : "text-danger"}`}>{valid ? t("presetsHint") : t("presetsInvalid")}</span>
    </div>
  );
}

function RawJson({ value, onSave }: { value: unknown; onSave: (next: unknown) => void }) {
  const t = useTranslations("settings.json");
  const [invalid, setInvalid] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <textarea
        className="h-24 w-full rounded-theme border border-border bg-surface px-3 py-2 font-mono text-xs"
        defaultValue={JSON.stringify(value ?? null, null, 2)}
        onBlur={(e) => {
          try {
            onSave(JSON.parse(e.target.value));
            setInvalid(false);
          } catch {
            setInvalid(true);
          }
        }}
      />
      {invalid && <span className="text-xs text-danger">{t("invalid")}</span>}
    </div>
  );
}
