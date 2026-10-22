"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import type { MediaRef } from "@clothing/shared/media";
import { api, ApiError } from "../../../../lib/api";
import { mediaImageLoader } from "../../../../lib/media-image-loader";
import { useCurrentStaff } from "../../../../lib/use-current-staff";
import { Banner, Button, Card } from "../../../../components/ui";

interface MediaItem {
  id: string;
  kind: "image" | "video" | "document" | "font";
  originalName: string;
  width: number | null;
  height: number | null;
  url: string;
  variantUrls: Record<string, string> | null;
  mediaRef: MediaRef;
}

interface DirectUploadTicket {
  supported: boolean;
  storageDriver?: string;
  providerInstanceId?: string | null;
  storageKey?: string;
  externalId?: string | null;
  method?: "PUT" | "POST";
  url?: string;
  fields?: Record<string, string>;
  headers?: Record<string, string>;
}

interface StorageProviderInstance {
  id: string;
  name: string;
  driver: string;
}

interface MigrationJob {
  id: string;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  totalCount: number;
  processedCount: number;
  failedCount: number;
}

function ProviderBadge({ provider }: { provider: string }) {
  return <span className="rounded-theme bg-muted px-1.5 py-0.5 text-[10px] uppercase text-surface-foreground/60">{provider}</span>;
}

/** Super Admin only (see SuperAdminGuard) — "Move media to provider X", docs/PROJECT_SPEC.md change request 2026-10-22, §7. */
function MigrationPanel() {
  const t = useTranslations("media");
  const [instances, setInstances] = useState<StorageProviderInstance[]>([]);
  const [target, setTarget] = useState("env");
  const [eligible, setEligible] = useState<number | null>(null);
  const [job, setJob] = useState<MigrationJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.get<StorageProviderInstance[]>("/admin/providers?capability=storage").then(setInstances).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!job || job.status === "done" || job.status === "failed" || job.status === "cancelled") return;
    const timer = setInterval(() => {
      void api
        .get<MigrationJob>(`/admin/media-migrations/${job.id}`)
        .then(setJob)
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
  }, [job]);

  async function handleDryRun() {
    setError(null);
    try {
      const result = await api.post<{ totalCount: number }>("/admin/media-migrations", { toProvider: target, dryRun: true });
      setEligible(result.totalCount);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to preview");
    }
  }

  async function handleStart() {
    setError(null);
    try {
      const result = await api.post<{ totalCount: number; job?: MigrationJob }>("/admin/media-migrations", { toProvider: target, dryRun: false });
      if (result.job) setJob({ ...result.job, totalCount: result.totalCount, processedCount: 0, failedCount: 0 });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start migration");
    }
  }

  return (
    <Card className="mt-6 flex flex-col gap-3 p-4">
      <h2 className="text-sm font-medium text-surface-foreground">{t("migratePanelTitle")}</h2>
      {error && <Banner kind="error">{error}</Banner>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-surface-foreground/70">{t("migrateTarget")}</span>
          <select className="rounded-theme border border-border bg-surface px-3 py-2 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="env">env</option>
            {instances.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.driver})
              </option>
            ))}
          </select>
        </label>
        <Button variant="secondary" onClick={() => void handleDryRun()}>
          {t("migrateDryRun")}
        </Button>
        <Button onClick={() => void handleStart()} disabled={job !== null && job.status !== "done" && job.status !== "failed"}>
          {t("migrateStart")}
        </Button>
      </div>
      {eligible !== null && <p className="text-sm text-surface-foreground/70">{t("migrateEligible", { count: eligible })}</p>}
      {job && (
        <p className="text-sm text-surface-foreground/70">
          {t("migrateProgress", { processed: job.processedCount, total: job.totalCount, failed: job.failedCount })} —{" "}
          {job.status === "done" ? t("migrateStatusDone") : t("migrateStatusRunning")}
        </p>
      )}
    </Card>
  );
}

export default function MediaPage() {
  const t = useTranslations("media");
  const { staff } = useCurrentStaff();
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

  /** Direct-to-provider upload when supported (s3/cloudinary), falling back to the multipart server upload otherwise (local, or any ticket failure) — docs/PROJECT_SPEC.md change request 2026-10-22, §5. */
  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const ticket = await api.post<DirectUploadTicket>("/admin/media/direct-upload-ticket", {
        mimeType: file.type || "application/octet-stream",
        originalName: file.name,
      });

      if (!ticket.supported || !ticket.url) {
        const formData = new FormData();
        formData.append("file", file);
        await api.upload("/admin/media", formData);
      } else if (ticket.method === "PUT") {
        const putResponse = await fetch(ticket.url, { method: "PUT", headers: ticket.headers, body: file });
        if (!putResponse.ok) throw new Error("Direct upload to storage failed");
        await api.post("/admin/media/finalize", {
          storageDriver: ticket.storageDriver,
          providerInstanceId: ticket.providerInstanceId ?? null,
          storageKey: ticket.storageKey,
          externalId: ticket.externalId ?? null,
          originalName: file.name,
          mimeType: file.type,
        });
      } else {
        const form = new FormData();
        for (const [key, value] of Object.entries(ticket.fields ?? {})) form.append(key, value);
        form.append("file", file);
        const postResponse = await fetch(ticket.url, { method: "POST", body: form });
        const json = (await postResponse.json().catch(() => ({}))) as Record<string, unknown>;
        if (!postResponse.ok) throw new Error(typeof json.error === "object" && json.error && "message" in json.error ? String(json.error.message) : "Direct upload failed");
        await api.post("/admin/media/finalize", {
          storageDriver: ticket.storageDriver,
          providerInstanceId: ticket.providerInstanceId ?? null,
          storageKey: ticket.storageKey,
          externalId: (json.public_id as string | undefined) ?? ticket.externalId ?? null,
          originalName: file.name,
          mimeType: file.type,
          width: (json.width as number | undefined) ?? null,
          height: (json.height as number | undefined) ?? null,
          bytes: (json.bytes as number | undefined) ?? null,
          version: (json.version as number | undefined) ?? null,
        });
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Upload failed");
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
              <div className="relative aspect-square w-full overflow-hidden rounded-theme">
                <Image
                  loader={mediaImageLoader(item.mediaRef)}
                  src={item.mediaRef.url}
                  alt={item.originalName}
                  fill
                  sizes="200px"
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-theme bg-muted text-xs">{item.kind}</div>
            )}
            <div className="truncate text-xs text-surface-foreground/70">{item.originalName}</div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-surface-foreground/50">
                {item.width && item.height ? `${item.width}×${item.height}` : ""}
                <ProviderBadge provider={item.mediaRef.provider} />
              </span>
              <button onClick={() => handleDelete(item.id)} className="text-danger">
                ×
              </button>
            </div>
          </Card>
        ))}
        {items.length === 0 && <p className="text-sm text-surface-foreground/60">—</p>}
      </div>

      {staff?.isSuperAdmin && <MigrationPanel />}
    </div>
  );
}
