import { describe, expect, it } from "vitest";
import { quintileScores, rfmSegmentFor, scoreRfm } from "./rfm.ts";

describe("quintileScores", () => {
  it("spreads ten distinct values across 1–5", () => {
    expect(quintileScores([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it("gives tied values the same score", () => {
    const scores = quintileScores([5, 5, 5, 5, 100]);
    expect(new Set(scores.slice(0, 4)).size).toBe(1);
    expect(scores[4]).toBe(5);
  });

  it("inverts when lower is better (recency)", () => {
    expect(quintileScores([1, 2, 3, 4, 5], false)).toEqual([5, 4, 3, 2, 1]);
  });

  it("handles empty and single inputs", () => {
    expect(quintileScores([])).toEqual([]);
    expect(quintileScores([42])).toEqual([1]);
  });
});

describe("rfmSegmentFor", () => {
  it("labels the classic grid corners", () => {
    expect(rfmSegmentFor(5, 5, 5)).toBe("champions");
    expect(rfmSegmentFor(3, 5, 4)).toBe("loyal");
    expect(rfmSegmentFor(5, 1, 1)).toBe("new_customers");
    expect(rfmSegmentFor(1, 5, 5)).toBe("cant_lose");
    expect(rfmSegmentFor(2, 4, 5)).toBe("at_risk");
    expect(rfmSegmentFor(2, 1, 2)).toBe("about_to_sleep");
    expect(rfmSegmentFor(1, 2, 3)).toBe("hibernating");
    expect(rfmSegmentFor(1, 1, 1)).toBe("lost");
    expect(rfmSegmentFor(3, 2, 1)).toBe("need_attention");
  });
});

describe("scoreRfm", () => {
  it("scores the best customer highest on all three", () => {
    const rows = [
      { id: "best", recencyDays: 2, frequency: 12, monetary: 9_000_000 },
      { id: "mid", recencyDays: 40, frequency: 3, monetary: 500_000 },
      { id: "old", recencyDays: 300, frequency: 1, monetary: 100_000 },
      { id: "x", recencyDays: 90, frequency: 2, monetary: 200_000 },
      { id: "y", recencyDays: 20, frequency: 4, monetary: 800_000 },
    ];
    const scored = scoreRfm(rows);
    const best = scored.find((s) => s.id === "best")!;
    expect(best).toMatchObject({ r: 5, f: 5, m: 5, segment: "champions" });
    expect(scored.find((s) => s.id === "old")).toMatchObject({ r: 1, f: 1, m: 1, segment: "lost" });
  });
});
