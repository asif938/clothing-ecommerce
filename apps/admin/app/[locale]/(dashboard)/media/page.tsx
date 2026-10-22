"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card } from "../../../../components/ui";

interface MediaItem {
  id: string;
  kind: "image" | "video" | "document" | "font";
  originalName: string;
  width: number | null;
  height: number | null;
  url: string;
  variantUrls: Record<string, string> | null;
  blurDataUrl: string | null;
}

export default function MediaPage() {
  const t = useTranslations("media");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      setItems(await api.get<MediaItem[]>("/admin/media"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load media");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() is also reused to refetch after mutations below, so it must stay a named async function, not inline .then() chaining.
    void load();
  }, []);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.upload("/admin/media", formData);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/admin/media/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <Button disabled={uploading} onClick={() => fileInput.current?.click()}>
          {uploading ? "…" : t("upload")}
        </Button>
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
          }}
        />
      </div>
      {error && (
        <div className="mt-4">
          <Banner kind="error">{error}</Banner>
        </div>
      )}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {items.map((item) => (
          <Card key={item.id} className="flex flex-col gap-2 p-3">
            {item.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element -- admin-only media library preview, not an optimized remote image
              <img src={item.variantUrls?.thumb ?? item.url} alt={item.originalName} className="aspect-square w-full rounded-theme object-cover" />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-theme bg-muted text-xs">{item.kind}</div>
            )}
            <div className="truncate text-xs text-surface-foreground/70">{item.originalName}</div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-surface-foreground/50">
                {item.width && item.height ? `${item.width}×${item.height}` : ""}
              </span>
              <button onClick={() => handleDelete(item.id)} className="text-danger">
                ×
              </button>
            </div>
          </Card>
        ))}
        {items.length === 0 && <p className="text-sm text-surface-foreground/60">—</p>}
      </div>
    </div>
  );
}
