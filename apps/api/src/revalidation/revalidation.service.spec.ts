import { describe, expect, it, vi, afterEach } from "vitest";
import { RevalidationService } from "./revalidation.service";

function makeConfig(values: Record<string, string>) {
  return { get: vi.fn((key: string) => values[key] ?? "") };
}

describe("RevalidationService.revalidate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing for an empty tag list", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const service = new RevalidationService(makeConfig({ REVALIDATE_SECRET: "s", STOREFRONT_URL: "http://sf" }) as never);
    await service.revalidate([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips the call when no secret is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const service = new RevalidationService(makeConfig({ REVALIDATE_SECRET: "", STOREFRONT_URL: "http://sf" }) as never);
    await service.revalidate(["settings"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the tags with the shared secret header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const service = new RevalidationService(makeConfig({ REVALIDATE_SECRET: "s3cret", STOREFRONT_URL: "http://sf" }) as never);
    await service.revalidate(["settings", "page:home"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://sf/api/revalidate",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "x-revalidate-secret": "s3cret" }) }),
    );
    expect(JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body)).toEqual({ tags: ["settings", "page:home"] });
  });

  it("never throws when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const service = new RevalidationService(makeConfig({ REVALIDATE_SECRET: "s", STOREFRONT_URL: "http://sf" }) as never);
    await expect(service.revalidate(["settings"])).resolves.toBeUndefined();
  });
});
