"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link } from "../../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../../lib/api";
import { useCurrentStaff } from "../../../../../../lib/use-current-staff";
import { BlockListEditor, blockErrors, type BlockInstance } from "../../../../../../components/block-list-editor";
import { Banner, Button, Card, TextField } from "../../../../../../components/ui";

interface Page {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "scheduled" | "published";
  blocksDraft: BlockInstance[];
  blocksPublished: BlockInstance[] | null;
}

interface PageVersion {
  id: string;
  createdAt: string;
}

type SaveState = "idle" | "pending" | "saving" | "saved" | "invalid" | "error";

const AUTOSAVE_MS = 1000;

/**
 * CMS page editor (home page and every other page): sections are edited with
 * forms (components/block-list-editor.tsx), saved automatically as a draft a
 * second after typing stops, and go live only on Publish or at the scheduled
 * time.
 */
export default function PageEditorPage() {
  const t = useTranslations("cms");
  const tb = useTranslations("blocks");
  const tCommon = useTranslations("common");
  const params = useParams<{ id: string }>();
  const pageId = params.id;
  const { staff } = useCurrentStaff();
  const isSuperAdmin = staff?.isSuperAdmin ?? false;

  const [page, setPage] = useState<Page | null>(null);
  const [blocks, setBlocks] = useState<BlockInstance[]>([]);
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [title, setTitle] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, v] = await Promise.all([api.get<Page>(`/admin/cms/pages/${pageId}`), api.get<PageVersion[]>(`/admin/cms/pages/${pageId}/versions`)]);
      setPage(p);
      setBlocks(p.blocksDraft);
      setVersions(v);
      setTitle(p.title);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load page");
    }
  }, [pageId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  const save = useCallback(
    async (next: BlockInstance[]) => {
      setSaveState("saving");
      try {
        await api.patch(`/admin/cms/pages/${pageId}/blocks`, { blocks: next });
        setPage((prev) => (prev ? { ...prev, blocksDraft: next } : prev));
        setSaveState("saved");
      } catch (err) {
        setSaveState("error");
        setError(err instanceof ApiError ? err.message : tb("saveFailed"));
      }
    },
    [pageId, tb],
  );

  /** Every edit shows at once and is saved as a draft shortly after typing stops; a section with a problem holds the save until it is fixed. */
  function commit(next: BlockInstance[]) {
    setBlocks(next);
    setError(null);
    setNotice(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (blockErrors(next, isSuperAdmin).size > 0) {
      setSaveState("invalid");
      return;
    }
    setSaveState("pending");
    saveTimer.current = setTimeout(() => void save(next), AUTOSAVE_MS);
  }

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  async function handleSaveTitle() {
    if (!page || title === page.title) return;
    try {
      await api.patch(`/admin/cms/pages/${pageId}`, { title });
      setPage({ ...page, title });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    }
  }

  async function flushPendingSave(): Promise<boolean> {
    if (saveState === "invalid") {
      setError(tb("fixBeforePublish"));
      return false;
    }
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      await save(blocks);
    }
    return true;
  }

  async function handlePublish() {
    if (!(await flushPendingSave())) return;
    try {
      await api.post(`/admin/cms/pages/${pageId}/publish`, {});
      await load();
      setNotice(tb("published"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to publish");
    }
  }

  async function handleSchedule() {
    if (!scheduleAt || !(await flushPendingSave())) return;
    try {
      await api.post(`/admin/cms/pages/${pageId}/schedule`, { publishAt: new Date(scheduleAt).toISOString() });
      await load();
      setNotice(tb("scheduled"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to schedule");
    }
  }

  async function handleRestore(versionId: string) {
    if (!window.confirm(tb("restoreConfirm"))) return;
    try {
      await api.post(`/admin/cms/pages/${pageId}/versions/${versionId}/restore`, {});
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to restore");
    }
  }

  if (!page) {
    return (
      <div className="flex flex-col gap-4">
        {error && <Banner kind="error">{error}</Banner>}
        <p className="text-sm text-surface-foreground/60">{tCommon("loading")}</p>
      </div>
    );
  }

  const hasUnpublished = JSON.stringify(blocks) !== JSON.stringify(page.blocksPublished ?? []);
  const saveLabel = saveState === "idle" ? "" : tb(`saveState.${saveState}`);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/cms/pages" className="text-sm text-surface-foreground/60 hover:underline">
          ← {t("backToPages")}
        </Link>
        <span className={`text-sm ${saveState === "invalid" || saveState === "error" ? "text-danger" : "text-surface-foreground/60"}`}>{saveLabel}</span>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}

      <Card className="flex flex-col gap-3">
        <TextField label={t("pageTitle")} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => void handleSaveTitle()} />
        <p className="text-sm text-surface-foreground/70">
          {tb(`status.${page.status}`)}
          {hasUnpublished ? ` · ${tb("unpublishedChanges")}` : ""}
        </p>
        <p className="text-xs text-surface-foreground/60">{tb("draftHint")}</p>
        <div className="flex flex-wrap items-end gap-2">
          <Button onClick={() => void handlePublish()}>{t("publish")}</Button>
          <TextField label={t("scheduleAt")} type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
          <Button variant="secondary" onClick={() => void handleSchedule()} disabled={!scheduleAt}>
            {t("schedule")}
          </Button>
        </div>
      </Card>

      <BlockListEditor blocks={blocks} onChange={commit} isSuperAdmin={isSuperAdmin} />

      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-surface-foreground">{t("versionsTitle")}</h2>
        <p className="text-xs text-surface-foreground/60">{tb("versionsHint")}</p>
        <ul className="flex flex-col gap-1">
          {versions.map((version) => (
            <li key={version.id} className="flex items-center justify-between rounded-theme border border-border px-3 py-2 text-sm">
              <span>{new Date(version.createdAt).toLocaleString()}</span>
              <button onClick={() => void handleRestore(version.id)} className="text-xs text-brand">
                {t("restore")}
              </button>
            </li>
          ))}
          {versions.length === 0 && <li className="text-sm text-surface-foreground/50">—</li>}
        </ul>
      </Card>
    </div>
  );
}
