import { describe, expect, it, vi } from "vitest";
import { ReviewsService } from "./reviews.service";

function make(review: { id: string; helpfulCount: number } | null, createError?: unknown) {
  const tx = {
    reviewHelpfulVote: { create: vi.fn(() => (createError ? Promise.reject(createError) : Promise.resolve({}))) },
    review: { update: vi.fn(() => Promise.resolve({ helpfulCount: (review?.helpfulCount ?? 0) + 1 })) },
  };
  const prisma = {
    review: { findFirst: vi.fn(() => Promise.resolve(review)) },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { service: new ReviewsService(prisma as never, {} as never), prisma, tx };
}

describe("ReviewsService.markHelpful", () => {
  it("counts the first vote from a visitor", async () => {
    const { service, prisma } = make({ id: "r1", helpfulCount: 4 });
    expect(await service.markHelpful("r1", "anon:abc")).toEqual({ helpfulCount: 5, counted: true });
    expect(prisma.review.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "r1", status: "approved" } }));
  });

  it("ignores a repeat vote from the same visitor", async () => {
    const { service, tx } = make({ id: "r1", helpfulCount: 4 }, { code: "P2002" });
    expect(await service.markHelpful("r1", "anon:abc")).toEqual({ helpfulCount: 4, counted: false });
    expect(tx.review.update).not.toHaveBeenCalled();
  });

  it("404s for reviews that aren't approved (no leaking pending/rejected reviews)", async () => {
    const { service } = make(null);
    await expect(service.markHelpful("r1", "anon:abc")).rejects.toMatchObject({ response: { code: "REVIEW_NOT_FOUND" } });
  });
});
