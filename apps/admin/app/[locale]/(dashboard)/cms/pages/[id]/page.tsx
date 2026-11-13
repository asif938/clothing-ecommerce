"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link } from "../../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../../../components/ui";

const BLOCK_TYPES = [
  "hero",
  "rich_text",
  "image_text",
  "category_tiles",
  "product_grid",
  "banner_strip",
  "faq_accordion",
  "newsletter_signup",
  "spacer",
  "for_you",
  "custom_html",
] as const;

interface BlockInstance {
  id: string;
  type: string;
  props: Record<string, unknown>;
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

function HeroFields({ block, onChange }: { block: BlockInstance; onChange: (props: Record<string, unknown>) => void }) {
  const props = block.props as { heading?: { en?: string; bn?: string }; subheading?: { en?: string; bn?: string }; ctaText?: { en?: string; bn?: string }; ctaUrl?: string; imageUrl?: string | null };
  return (
    <div className="grid grid-cols-2 gap-2">
      <TextField label="Heading (en)" value={props.heading?.en ?? ""} onChange={(e) => onChange({ ...props, heading: { ...props.heading, en: e.target.value } })} />
      <TextField label="Heading (bn)" value={props.heading?.bn ?? ""} onChange={(e) => onChange({ ...props, heading: { ...props.heading, bn: e.target.value } })} />
      <TextField label="Subheading (en)" value={props.subheading?.en ?? ""} onChange={(e) => onChange({ ...props, subheading: { ...props.subheading, en: e.target.value } })} />
      <TextField label="Subheading (bn)" value={props.subheading?.bn ?? ""} onChange={(e) => onChange({ ...props, subheading: { ...props.subheading, bn: e.target.value } })} />
      <TextField label="CTA text (en)" value={props.ctaText?.en ?? ""} onChange={(e) => onChange({ ...props, ctaText: { ...props.ctaText, en: e.target.value } })} />
      <TextField label="CTA URL" value={props.ctaUrl ?? ""} onChange={(e) => onChange({ ...props, ctaUrl: e.target.value })} />
      <TextField label="Image URL" value={props.imageUrl ?? ""} onChange={(e) => onChange({ ...props, imageUrl: e.target.value || null })} />
    </div>
  );
}

function BlockEditor({ block, onChange, onRemove, onMove }: { block: BlockInstance; onChange: (props: Record<string, unknown>) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void }) {
  const [jsonText, setJsonText] = useState(JSON.stringify(block.props, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-surface-foreground">{block.type}</span>
        <div className="flex gap-2 text-xs">
          <button onClick={() => onMove(-1)} className="text-surface-foreground/60">
            ↑
          </button>
          <button onClick={() => onMove(1)} className="text-surface-foreground/60">
            ↓
          </button>
          <button onClick={onRemove} className="text-danger">
            ×
          </button>
        </div>
      </div>
      {block.type === "hero" ? (
        <HeroFields block={block} onChange={onChange} />
      ) : (
        <div className="flex flex-col gap-1">
          <textarea
            className="h-32 rounded-theme border border-border bg-surface px-3 py-2 font-mono text-xs"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            onBlur={() => {
              try {
                const parsed = JSON.parse(jsonText);
                setJsonError(null);
                onChange(parsed);
              } catch {
                setJsonError("Invalid JSON");
              }
            }}
          />
          {jsonError && <span className="text-xs text-danger">{jsonError}</span>}
        </div>
      )}
    </Card>
  );
}

export default function PageEditorPage() {
  const t = useTranslations("cms");
  const tCommon = useTranslations("common");
  const params = useParams<{ id: string }>();
  const pageId = params.id;

  const [page, setPage] = useState<Page | null>(null);
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [title, setTitle] = useState("");
  const [newBlockType, setNewBlockType] = useState<(typeof BLOCK_TYPES)[number]>("rich_text");
  const [scheduleAt, setScheduleAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, v] = await Promise.all([api.get<Page>(`/admin/cms/pages/${pageId}`), api.get<PageVersion[]>(`/admin/cms/pages/${pageId}/versions`)]);
      setPage(p);
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

  async function handleSaveTitle() {
    try {
      await api.patch(`/admin/cms/pages/${pageId}`, { title });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    }
  }

  async function handleSaveBlocks(blocks: BlockInstance[]) {
    setPage((prev) => (prev ? { ...prev, blocksDraft: blocks } : prev));
    try {
      await api.patch(`/admin/cms/pages/${pageId}/blocks`, { blocks });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save blocks");
    }
  }

  function updateBlockProps(index: number, props: Record<string, unknown>) {
    if (!page) return;
    const blocks = page.blocksDraft.map((b, i) => (i === index ? { ...b, props } : b));
    void handleSaveBlocks(blocks);
  }

  function moveBlock(index: number, dir: -1 | 1) {
    if (!page) return;
    const blocks = [...page.blocksDraft];
    const target = index + dir;
    if (target < 0 || target >= blocks.length) return;
    [blocks[index], blocks[target]] = [blocks[target]!, blocks[index]!];
    void handleSaveBlocks(blocks);
  }

  function removeBlock(index: number) {
    if (!page) return;
    void handleSaveBlocks(page.blocksDraft.filter((_, i) => i !== index));
  }

  function addBlock() {
    if (!page) return;
    const block: BlockInstance = { id: `b${Date.now()}`, type: newBlockType, props: {} };
    void handleSaveBlocks([...page.blocksDraft, block]);
  }

  async function handlePublish() {
    try {
      await api.post(`/admin/cms/pages/${pageId}/publish`, {});
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to publish");
    }
  }

  async function handleSchedule() {
    if (!scheduleAt) return;
    try {
      await api.post(`/admin/cms/pages/${pageId}/schedule`, { publishAt: new Date(scheduleAt).toISOString() });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to schedule");
    }
  }

  async function handleRestore(versionId: string) {
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link href="/cms/pages" className="text-sm text-surface-foreground/60 hover:underline">
          ← {t("backToPages")}
        </Link>
        <div className="flex items-center gap-2">
          {saved && <span className="text-sm text-success">{t("draftSaved")}</span>}
          <span className="text-xs text-surface-foreground/50">{page.status}</span>
        </div>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-wrap items-end gap-2">
        <TextField label={t("pageTitle")} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => void handleSaveTitle()} />
        <Button onClick={() => void handlePublish()}>{t("publish")}</Button>
        <TextField label={t("scheduleAt")} type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
        <Button variant="secondary" onClick={() => void handleSchedule()}>
          {t("schedule")}
        </Button>
      </Card>

      <div className="flex flex-col gap-3">
        {page.blocksDraft.map((block, index) => (
          <BlockEditor
            key={block.id}
            block={block}
            onChange={(props) => updateBlockProps(index, props)}
            onRemove={() => removeBlock(index)}
            onMove={(dir) => moveBlock(index, dir)}
          />
        ))}
      </div>

      <Card className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-surface-foreground">{t("addBlock")}</span>
          <select className="rounded-theme border border-border bg-surface px-3 py-2 text-sm" value={newBlockType} onChange={(e) => setNewBlockType(e.target.value as (typeof BLOCK_TYPES)[number])}>
            {BLOCK_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <Button variant="secondary" onClick={addBlock}>
          {t("addBlock")}
        </Button>
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-surface-foreground">{t("versionsTitle")}</h2>
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
