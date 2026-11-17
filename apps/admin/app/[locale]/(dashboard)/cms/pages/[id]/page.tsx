"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { BLOCK_SCHEMAS, validateBlocks } from "@clothing/blocks/schemas";
import { Link } from "../../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../../lib/api";
import { BLOCK_FORMS, BLOCK_ORDER } from "../../../../../../lib/block-fields";
import { useCurrentStaff } from "../../../../../../lib/use-current-staff";
import { BlockFieldsForm } from "../../../../../../components/block-form";
import { Banner, Button, Card, TextField } from "../../../../../../components/ui";

interface BlockInstance {
  id: string;
  type: string;
  props: Record<string, unknown>;
  visibility?: unknown;
  schedule?: unknown;
}

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

/** New section ids only need to be unique within the page. */
const newBlockId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function cloneDefaults(type: string): Record<string, unknown> {
  return JSON.parse(JSON.stringify(BLOCK_SCHEMAS[type]?.defaults ?? {})) as Record<string, unknown>;
}

/** Raw JSON editing, kept only for a block type the form description doesn't cover yet. */
function AdvancedJson({ props, onChange }: { props: Record<string, unknown>; onChange: (props: Record<string, unknown>) => void }) {
  const t = useTranslations("blocks");
  const [text, setText] = useState(JSON.stringify(props, null, 2));
  const [invalid, setInvalid] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-surface-foreground/60">{t("advancedJson")}</span>
      <textarea
        className="h-40 rounded-theme border border-border bg-surface px-3 py-2 font-mono text-xs"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          try {
            onChange(JSON.parse(text) as Record<string, unknown>);
            setInvalid(false);
          } catch {
            setInvalid(true);
          }
        }}
      />
      {invalid && <span className="text-xs text-danger">{t("invalidJson")}</span>}
    </div>
  );
}

function BlockCard({
  block,
  index,
  count,
  expanded,
  error,
  onToggle,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
}: {
  block: BlockInstance;
  index: number;
  count: number;
  expanded: boolean;
  error: string | null;
  onToggle: () => void;
  onChange: (props: Record<string, unknown>) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("blocks");
  const spec = BLOCK_FORMS[block.type];
  const known = Boolean(BLOCK_SCHEMAS[block.type]);
  const typeLabel = known ? t(`types.${block.type}`) : block.type;

  return (
    <Card className={`flex flex-col gap-3 ${error ? "border-danger" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onToggle} className="flex items-center gap-2 text-left">
          <span className="text-xs text-surface-foreground/50">{index + 1}.</span>
          <span className="font-medium text-surface-foreground">{typeLabel}</span>
          <span className="text-xs text-surface-foreground/50">{expanded ? "▲" : "▼"}</span>
        </button>
        <div className="flex items-center gap-3 text-xs">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="disabled:opacity-30" aria-label={t("moveUp")}>
            ↑ {t("moveUp")}
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} className="disabled:opacity-30" aria-label={t("moveDown")}>
            ↓ {t("moveDown")}
          </button>
          <button type="button" onClick={onDuplicate}>{t("duplicate")}</button>
          <button type="button" onClick={onRemove} className="text-danger">{t("remove")}</button>
        </div>
      </div>
      {error && <p className="text-xs text-danger">{t("blockInvalid")} ({error})</p>}
      {expanded && (
        <>
          {spec && <p className="text-xs text-surface-foreground/60">{t(`descriptions.${spec.description}`)}</p>}
          {spec ? <BlockFieldsForm fields={spec.fields} props={block.props} onChange={onChange} /> : <AdvancedJson props={block.props} onChange={onChange} />}
        </>
      )}
    </Card>
  );
}

export default function PageEditorPage() {
  const t = useTranslations("cms");
  const tb = useTranslations("blocks");
  const tCommon = useTranslations("common");
  const params = useParams<{ id: string }>();
  const pageId = params.id;
  const { staff } = useCurrentStaff();

  const [page, setPage] = useState<Page | null>(null);
  const [blocks, setBlocks] = useState<BlockInstance[]>([]);
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [title, setTitle] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
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

  /** Client-side check with the same schemas the API uses, so a bad section is pointed at before saving. */
  const blockErrors = useMemo(() => {
    const { errors } = validateBlocks(blocks, staff?.isSuperAdmin ?? false);
    return new Map(errors.map((e) => [e.blockId, e.message]));
  }, [blocks, staff?.isSuperAdmin]);

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

  /** Every edit updates the editor at once and is saved as a draft shortly after typing stops. */
  function commit(next: BlockInstance[]) {
    setBlocks(next);
    setError(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const invalid = validateBlocks(next, staff?.isSuperAdmin ?? false).errors.length > 0;
    if (invalid) {
      setSaveState("invalid");
      return;
    }
    setSaveState("pending");
    saveTimer.current = setTimeout(() => void save(next), AUTOSAVE_MS);
  }

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const updateProps = (index: number, props: Record<string, unknown>) => commit(blocks.map((b, i) => (i === index ? { ...b, props } : b)));
  const moveBlock = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target]!, next[index]!];
    commit(next);
  };
  const removeBlock = (index: number) => {
    if (!window.confirm(tb("removeConfirm"))) return;
    commit(blocks.filter((_, i) => i !== index));
  };
  const duplicateBlock = (index: number) => {
    const copy = { ...JSON.parse(JSON.stringify(blocks[index])), id: newBlockId() } as BlockInstance;
    const next = [...blocks];
    next.splice(index + 1, 0, copy);
    setExpanded((prev) => new Set(prev).add(copy.id));
    commit(next);
  };
  const addBlock = (type: string) => {
    const block: BlockInstance = { id: newBlockId(), type, props: cloneDefaults(type) };
    setExpanded((prev) => new Set(prev).add(block.id));
    setAdding(false);
    commit([...blocks, block]);
  };
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
  const addable = BLOCK_ORDER.filter((type) => BLOCK_SCHEMAS[type] && (!BLOCK_SCHEMAS[type]!.superAdminOnly || staff?.isSuperAdmin));
  const saveLabel = {
    idle: "",
    pending: tb("saveState.pending"),
    saving: tb("saveState.saving"),
    saved: tb("saveState.saved"),
    invalid: tb("saveState.invalid"),
    error: tb("saveState.error"),
  }[saveState];

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

      <div className="flex flex-col gap-3">
        {blocks.length === 0 && <p className="text-sm text-surface-foreground/60">{tb("emptyPage")}</p>}
        {blocks.map((block, index) => (
          <BlockCard
            key={block.id}
            block={block}
            index={index}
            count={blocks.length}
            expanded={expanded.has(block.id)}
            error={blockErrors.get(block.id) ?? null}
            onToggle={() => toggle(block.id)}
            onChange={(props) => updateProps(index, props)}
            onMove={(dir) => moveBlock(index, dir)}
            onDuplicate={() => duplicateBlock(index)}
            onRemove={() => removeBlock(index)}
          />
        ))}
      </div>

      <Card className="flex flex-col gap-3">
        {!adding ? (
          <div>
            <Button variant="secondary" onClick={() => setAdding(true)}>
              + {tb("addSection")}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-surface-foreground">{tb("chooseSection")}</h2>
              <button type="button" className="text-xs text-surface-foreground/60" onClick={() => setAdding(false)}>
                {tCommon("cancel")}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {addable.map((type) => (
                <button key={type} type="button" onClick={() => addBlock(type)} className="flex flex-col gap-1 rounded-theme border border-border p-3 text-left hover:border-brand">
                  <span className="text-sm font-medium text-surface-foreground">{tb(`types.${type}`)}</span>
                  <span className="text-xs text-surface-foreground/60">{tb(`descriptions.${BLOCK_FORMS[type]?.description ?? type}`)}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </Card>

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
