import { deviceVisibilityClassName, getBlockDefinition, isBlockScheduledNow, isBlockVisibleForLocale, needsAudienceGate } from "@clothing/blocks";
import type { BlockInstance } from "../lib/store-api";
import { AudienceGate } from "./audience-gate";

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
        const rendered = (
          <div key={block.id} className={className || undefined}>
            <Component props={parsed.data} locale={locale} />
          </div>
        );
        // §16 M10 — audience-targeted blocks. Gating wraps the already
        // server-rendered output in a client component rather than
        // skipping render server-side, so the page itself stays static/
        // cacheable (see `AudienceGate`'s own doc comment).
        if (needsAudienceGate(block.visibility)) {
          return (
            <AudienceGate key={block.id} audience={block.visibility!.audience!}>
              {rendered}
            </AudienceGate>
          );
        }
        return rendered;
      })}
    </>
  );
}
