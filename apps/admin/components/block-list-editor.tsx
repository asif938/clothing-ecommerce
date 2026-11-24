"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { BLOCK_SCHEMAS, validateBlocks } from "@clothing/blocks/schemas";
import { BLOCK_FORMS, BLOCK_ORDER } from "../lib/block-fields";
import { BlockFieldsForm } from "./block-form";
import { Button, Card } from "./ui";

export interface BlockInstance {
  id: string;
  type: string;
  props: Record<string, unknown>;
  visibility?: unknown;
  schedule?: unknown;
}

/** New section ids only need to be unique within the page/post. */
export const newBlockId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function cloneDefaults(type: string): Record<string, unknown> {
  return JSON.parse(JSON.stringify(BLOCK_SCHEMAS[type]?.defaults ?? {})) as Record<string, unknown>;
}

/** Same validation the API runs on save: block id → problem. */
export function blockErrors(blocks: BlockInstance[], isSuperAdmin: boolean): Map<string, string> {
  return new Map(validateBlocks(blocks, isSuperAdmin).errors.map((e) => [e.blockId, e.message]));
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
  const typeLabel = BLOCK_SCHEMAS[block.type] ? t(`types.${block.type}`) : block.type;

  return (
    <Card className={`flex flex-col gap-3 ${error ? "border-danger" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onToggle} className="flex items-center gap-2 text-left">
          <span className="text-xs text-surface-foreground/50">{index + 1}.</span>
          <span className="font-medium text-surface-foreground">{typeLabel}</span>
          <span className="text-xs text-surface-foreground/50">{expanded ? "▲" : "▼"}</span>
        </button>
        <div className="flex items-center gap-3 text-xs">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="disabled:opacity-30">
            ↑ {t("moveUp")}
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} className="disabled:opacity-30">
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
          {spec ? <BlockFieldsForm fields={spec.fields} props={spec.normalize ? spec.normalize(block.props) : block.props} onChange={onChange} /> : <AdvancedJson props={block.props} onChange={onChange} />}
        </>
      )}
    </Card>
  );
}

/**
 * The list of sections on a CMS page or blog post: each section has a form
 * (see lib/block-fields.ts), can be collapsed, reordered, duplicated and
 * removed, and new sections are added from cards that say what they are for,
 * prefilled with the block's defaults. Saving is up to the caller.
 */
export function BlockListEditor({ blocks, onChange, isSuperAdmin, only }: { blocks: BlockInstance[]; onChange: (next: BlockInstance[]) => void; isSuperAdmin: boolean; only?: string[] }) {
  const t = useTranslations("blocks");
  const tCommon = useTranslations("common");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const errors = useMemo(() => blockErrors(blocks, isSuperAdmin), [blocks, isSuperAdmin]);

  const expand = (id: string) => setExpanded((prev) => new Set(prev).add(id));
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };
  const remove = (index: number) => {
    if (!window.confirm(t("removeConfirm"))) return;
    onChange(blocks.filter((_, i) => i !== index));
  };
  const duplicate = (index: number) => {
    const copy = { ...(JSON.parse(JSON.stringify(blocks[index])) as BlockInstance), id: newBlockId() };
    const next = [...blocks];
    next.splice(index + 1, 0, copy);
    expand(copy.id);
    onChange(next);
  };
  const add = (type: string) => {
    const block: BlockInstance = { id: newBlockId(), type, props: cloneDefaults(type) };
    expand(block.id);
    setAdding(false);
    onChange([...blocks, block]);
  };

  const addable = (only ?? BLOCK_ORDER).filter((type) => BLOCK_SCHEMAS[type] && (!BLOCK_SCHEMAS[type]!.superAdminOnly || isSuperAdmin));

  return (
    <div className="flex flex-col gap-3">
      {blocks.length === 0 && <p className="text-sm text-surface-foreground/60">{t("emptyPage")}</p>}
      {blocks.map((block, index) => (
        <BlockCard
          key={block.id}
          block={block}
          index={index}
          count={blocks.length}
          expanded={expanded.has(block.id)}
          error={errors.get(block.id) ?? null}
          onToggle={() => toggle(block.id)}
          onChange={(props) => onChange(blocks.map((b, i) => (i === index ? { ...b, props } : b)))}
          onMove={(dir) => move(index, dir)}
          onDuplicate={() => duplicate(index)}
          onRemove={() => remove(index)}
        />
      ))}
      <Card className="flex flex-col gap-3">
        {!adding ? (
          <div>
            <Button variant="secondary" onClick={() => setAdding(true)}>
              + {t("addSection")}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-surface-foreground">{t("chooseSection")}</h2>
              <button type="button" className="text-xs text-surface-foreground/60" onClick={() => setAdding(false)}>
                {tCommon("cancel")}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {addable.map((type) => (
                <button key={type} type="button" onClick={() => add(type)} className="flex flex-col gap-1 rounded-theme border border-border p-3 text-left hover:border-brand">
                  <span className="text-sm font-medium text-surface-foreground">{t(`types.${type}`)}</span>
                  <span className="text-xs text-surface-foreground/60">{t(`descriptions.${BLOCK_FORMS[type]?.description ?? type}`)}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
