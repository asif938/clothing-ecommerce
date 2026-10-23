import { deviceVisibilityClassName, getBlockDefinition, isBlockScheduledNow, isBlockVisibleForLocale } from "@clothing/blocks";
import type { BlockInstance } from "../lib/store-api";

/**
 * Renders a page's `blocksPublished` list (docs/PROJECT_SPEC.md §9.1). An
 * unknown block type, a schedule window that hasn't started/has ended, or
 * props that no longer validate against the current schema all just skip
 * that one block — never a crashed page.
 */
export function BlockRenderer({ blocks, locale }: { blocks: BlockInstance[]; locale: string }) {
  return (
    <>
      {blocks.map((block) => {
        if (!isBlockScheduledNow(block) || !isBlockVisibleForLocale(block, locale)) return null;

        const definition = getBlockDefinition(block.type);
        if (!definition) return null;

        const parsed = definition.schema.safeParse(block.props);
        if (!parsed.success) return null;

        const Component = definition.component;
        const className = deviceVisibilityClassName(block.visibility);
        return (
          <div key={block.id} className={className || undefined}>
            <Component props={parsed.data} locale={locale} />
          </div>
        );
      })}
    </>
  );
}
