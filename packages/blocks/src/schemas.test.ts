import { describe, expect, it } from "vitest";
import { validateBlocks } from "./schemas.ts";

describe("validateBlocks", () => {
  it("accepts a well-formed hero block and fills in schema defaults", () => {
    const { valid, errors } = validateBlocks([{ id: "b1", type: "hero", props: { heading: { en: "Hi" } } }], false);
    expect(errors).toEqual([]);
    expect(valid).toHaveLength(1);
    // A hero saved in the old single-image shape becomes one slide.
    expect(valid[0]?.props).toMatchObject({ slides: [{ heading: { en: "Hi" }, align: "left", fit: "cover" }], autoplay: true, intervalSeconds: 5 });
  });

  it("reports an unknown block type without throwing", () => {
    const { valid, errors } = validateBlocks([{ id: "b1", type: "not_a_real_block", props: {} }], false);
    expect(valid).toEqual([]);
    expect(errors).toEqual([{ blockId: "b1", type: "not_a_real_block", message: 'Unknown block type "not_a_real_block"' }]);
  });

  it("reports a schema failure with the block id", () => {
    const { valid, errors } = validateBlocks([{ id: "b1", type: "hero", props: { heading: "not an object" } }], false);
    expect(valid).toEqual([]);
    expect(errors[0]?.blockId).toBe("b1");
  });

  it("rejects custom_html for a non-Super-Admin and accepts it for one", () => {
    const block = { id: "b1", type: "custom_html", props: { html: "<p>hi</p>" } };
    expect(validateBlocks([block], false).errors).toEqual([{ blockId: "b1", type: "custom_html", message: 'Block type "custom_html" is Super Admin only' }]);
    expect(validateBlocks([block], true).errors).toEqual([]);
  });

  it("validates multiple blocks independently, collecting every error", () => {
    const { valid, errors } = validateBlocks(
      [
        { id: "b1", type: "hero", props: { heading: { en: "Hi" } } },
        { id: "b2", type: "unknown", props: {} },
      ],
      false,
    );
    expect(valid).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it("accepts an empty for_you block (all defaults) and rejects an out-of-range limit", () => {
    const ok = validateBlocks([{ id: "b1", type: "for_you", props: {} }], false);
    expect(ok.errors).toEqual([]);
    expect(ok.valid[0]!.props).toEqual({ limit: 8 });
    expect(validateBlocks([{ id: "b2", type: "for_you", props: { limit: 100 } }], false).errors).toHaveLength(1);
  });
});
