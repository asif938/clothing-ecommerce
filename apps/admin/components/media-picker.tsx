"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../lib/api";
import { Button } from "./ui";

export interface MediaItem {
  id: string;
  kind: "image" | "video" | "document" | "font";
  originalName: string;
  url: string;
  variantUrls: Record<string, string> | null;
}

/** A display-size URL for a picked image: the large variant when the storage driver produced one, else the original. */
function displayUrl(item: MediaItem): string {
  return item.variantUrls?.lg ?? item.url;
}

/**
 * Image field for the page builder and other content forms: shows the chosen
 * image, and opens the media library to pick one or upload a new file (which
 * goes to the active storage provider, e.g. Cloudinary). A pasted image link
 * still works for owners who host images elsewhere.
 */
export function MediaPickerField({
  label,
  value,
  onChange,
  onPick,
  hint,
  allowLink = true,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  /** Called with the chosen library file (or null when removed) — for records that store a media id rather than a URL. */
  onPick?: (item: MediaItem | null) => void;
  hint?: string;
  /** Records that store a media id can't keep a pasted link, so they hide that option. */
  allowLink?: boolean;
}) {
  const t = useTranslations("blocks");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLink, setShowLink] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || items) return;
    api
      .get<MediaItem[]>("/admin/media")
      .then((list) => setItems(list.filter((m) => m.kind === "image")))
      .catch((err) => setError(err instanceof ApiError ? err.message : t("mediaLoadFailed")));
  }, [open, items, t]);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const media = await api.upload<MediaItem>("/admin/media", form);
      onChange(displayUrl(media));
      onPick?.(media);
      setItems((prev) => (prev ? [media, ...prev] : prev));
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("uploadFailed"));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <span className="font-medium text-surface-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary storage hosts; next/image would need every host configured
          <img src={value} alt="" className="h-20 w-32 rounded-theme border border-border object-cover" />
        ) : (
          <div className="flex h-20 w-32 items-center justify-center rounded-theme border border-dashed border-border text-xs text-surface-foreground/50">{t("noImage")}</div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setOpen((v) => !v)}>
            {value ? t("changeImage") : t("chooseImage")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()} disabled={uploading}>
            {uploading ? t("uploading") : t("uploadImage")}
          </Button>
          {value && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                onChange(null);
                onPick?.(null);
              }}
            >
              {t("removeImage")}
            </Button>
          )}
          {allowLink && (
            <button type="button" className="text-xs text-surface-foreground/60 underline" onClick={() => setShowLink((v) => !v)}>
              {t("pasteLink")}
            </button>
          )}
        </div>
        <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
      </div>
      {allowLink && showLink && (
        <input
          className="rounded-theme border border-border bg-surface px-3 py-2 text-sm"
          placeholder="https://"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      )}
      {hint && <span className="text-xs text-surface-foreground/60">{hint}</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
      {open && (
        <div className="max-h-72 overflow-y-auto rounded-theme border border-border p-2">
          {!items && !error && <p className="p-2 text-xs text-surface-foreground/60">{t("loading")}</p>}
          {items && items.length === 0 && <p className="p-2 text-xs text-surface-foreground/60">{t("mediaEmpty")}</p>}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {items?.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.originalName}
                onClick={() => {
                  onChange(displayUrl(item));
                  onPick?.(item);
                  setOpen(false);
                }}
                className={`overflow-hidden rounded-theme border ${value === displayUrl(item) ? "border-brand ring-2 ring-brand" : "border-border"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
                <img src={item.variantUrls?.thumb ?? item.url} alt={item.originalName} className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
