import type { BlockComponentProps } from "../../registry.ts";
import type { CustomHtmlProps } from "./schema.ts";

/** `props.html` is already sanitized at save time (PagesService, Super Admin only) — never user input at render time. */
export function CustomHtmlBlock({ props }: BlockComponentProps<CustomHtmlProps>) {
  if (!props.html) return null;
  // The one block type explicitly allowed to render raw HTML, by design (§9.1).
  return <div dangerouslySetInnerHTML={{ __html: props.html }} />;
}
