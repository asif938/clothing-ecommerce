"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../components/ui";
import { Link } from "../../../../i18n/navigation";

type LocalizedText = { bn?: string; en?: string };

interface Stats {
  enabled: boolean;
  activeProducts: number;
  kinds: { kind: "bought_together" | "viewed_together"; pairs: number; products: number; computedAt: string | null }[];
}

interface ProductCardRow {
  id: string;
  slug: string;
  title: LocalizedText;
  imageUrl: string | null;
  score?: number;
}

interface Preview {
  affinities: { kind: string; score: number; support: number; product: { id: string; slug: string; title: LocalizedText } }[];
  boughtTogether: ProductCardRow[];
  similar: ProductCardRow[];
}

interface VisualStatus {
  enabled: boolean;
  useAi: boolean;
  aiIndexCatalog: boolean;
  activeProducts: number;
  indexedProducts: number;
  images: number;
  errors: number;
  aiTagged: number;
}

interface VisualResult {
  products: ProductCardRow[];
  tags: { garment: string; colors: string[]; pattern?: string } | null;
  indexedProducts: number;
}

interface ProductListItem {
  id: string;
  title: LocalizedText;
  slug: string;
}

function label(text: LocalizedText | null | undefined): string {
  return text?.en || text?.bn || "";
}

function ProductStrip({ products }: { products: ProductCardRow[] }) {
  const t = useTranslations("personalization");
  if (products.length === 0) return <p className="text-xs text-surface-foreground/60">{t("none")}</p>;
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {products.map((p) => (
        <Link key={p.id} href={`/products/${p.id}`} className="flex flex-col gap-1 text-xs">
          <div className="aspect-[3/4] overflow-hidden rounded-theme bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- API-resized thumbnail */}
            {p.imageUrl && <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />}
          </div>
          <span className="truncate">{label(p.title)}</span>
          {p.score !== undefined && <span className="text-surface-foreground/60">{Math.round(p.score * 100)}%</span>}
        </Link>
      ))}
    </div>
  );
}

/** Recommendations and visual search (§16 M14): health of the computed data, manual recompute, per-product preview, photo test. */
export default function PersonalizationPage() {
  const t = useTranslations("personalization");
  const [stats, setStats] = useState<Stats | null>(null);
  const [visual, setVisual] = useState<VisualStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<ProductListItem[]>([]);
  const [preview, setPreview] = useState<{ product: ProductListItem; data: Preview } | null>(null);
  const [testResult, setTestResult] = useState<VisualResult | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, v] = await Promise.all([api.get<Stats>("/admin/personalization/recommendations"), api.get<VisualStatus>("/admin/personalization/visual-search")]);
      setStats(s);
      setVisual(v);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  async function run(key: string, action: () => Promise<string>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function searchProducts() {
    if (query.trim().length < 2) return;
    try {
      const result = await api.get<{ data: ProductListItem[] }>(`/admin/products?pageSize=10&q=${encodeURIComponent(query.trim())}`);
      setMatches(result.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function showPreview(product: ProductListItem) {
    try {
      setPreview({ product, data: await api.get<Preview>(`/admin/personalization/recommendations/products/${product.id}`) });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function testPhoto(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    await run("test", async () => {
      const result = await api.upload<VisualResult>("/admin/personalization/visual-search/test", form);
      setTestResult(result);
      return t("testDone", { count: result.products.length });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-surface-foreground">{t("recommendations")}</h2>
            <p className="text-xs text-surface-foreground/60">{t("recommendationsHelp")}</p>
          </div>
          <Button
            disabled={busy !== null}
            onClick={() =>
              void run("recompute", async () => {
                const r = await api.post<{ bought_together: number; viewed_together: number }>("/admin/personalization/recommendations/recompute");
                return t("recomputed", { bought: r.bought_together, viewed: r.viewed_together });
              })
            }
          >
            {busy === "recompute" ? t("working") : t("recompute")}
          </Button>
        </div>
        {stats && !stats.enabled && <Banner kind="warning">{t("disabled")}</Banner>}
        {stats && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-surface-foreground/60">
                <th className="py-1">{t("kind")}</th>
                <th>{t("pairs")}</th>
                <th>{t("coverage")}</th>
                <th>{t("computedAt")}</th>
              </tr>
            </thead>
            <tbody>
              {stats.kinds.map((k) => (
                <tr key={k.kind} className="border-t border-border">
                  <td className="py-2">{t(`kind_${k.kind}`)}</td>
                  <td>{k.pairs}</td>
                  <td>{t("coverageValue", { products: k.products, total: stats.activeProducts })}</td>
                  <td>{k.computedAt ? new Date(k.computedAt).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <h3 className="text-sm font-semibold">{t("previewTitle")}</h3>
          <div className="flex flex-wrap items-end gap-2">
            <TextField label={t("productSearch")} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void searchProducts()} />
            <Button variant="secondary" onClick={() => void searchProducts()}>
              {t("find")}
            </Button>
          </div>
          {matches.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {matches.map((m) => (
                <Button key={m.id} variant="secondary" onClick={() => void showPreview(m)}>
                  {label(m.title) || m.slug}
                </Button>
              ))}
            </div>
          )}
          {preview && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">{label(preview.product.title)}</p>
              <div>
                <p className="mb-1 text-xs font-semibold text-surface-foreground/70">{t("boughtTogether")}</p>
                <ProductStrip products={preview.data.boughtTogether} />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-surface-foreground/70">{t("similar")}</p>
                <ProductStrip products={preview.data.similar} />
              </div>
              {preview.data.affinities.length > 0 && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-surface-foreground/60">
                      <th className="py-1">{t("kind")}</th>
                      <th>{t("product")}</th>
                      <th>{t("score")}</th>
                      <th>{t("support")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.data.affinities.map((a) => (
                      <tr key={`${a.kind}-${a.product.id}`} className="border-t border-border">
                        <td className="py-1">{t(`kind_${a.kind}`)}</td>
                        <td>{label(a.product.title)}</td>
                        <td>{a.score.toFixed(2)}</td>
                        <td>{a.support}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-surface-foreground">{t("visualSearch")}</h2>
            <p className="text-xs text-surface-foreground/60">{t("visualSearchHelp")}</p>
          </div>
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() => {
              if (!window.confirm(t("reindexConfirm"))) return;
              void run("reindex", async () => {
                const r = await api.post<{ cleared: number }>("/admin/personalization/visual-search/reindex");
                return t("reindexed", { count: r.cleared });
              });
            }}
          >
            {t("reindex")}
          </Button>
        </div>
        {visual && !visual.enabled && <Banner kind="info">{t("visualDisabled")}</Banner>}
        {visual && (
          <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <li>
              <span className="block text-xs text-surface-foreground/60">{t("indexedProducts")}</span>
              {visual.indexedProducts} / {visual.activeProducts}
            </li>
            <li>
              <span className="block text-xs text-surface-foreground/60">{t("images")}</span>
              {visual.images}
            </li>
            <li>
              <span className="block text-xs text-surface-foreground/60">{t("aiTagged")}</span>
              {visual.aiIndexCatalog ? visual.aiTagged : t("off")}
            </li>
            <li>
              <span className="block text-xs text-surface-foreground/60">{t("errors")}</span>
              <span className={visual.errors > 0 ? "text-danger" : undefined}>{visual.errors}</span>
            </li>
          </ul>
        )}
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <h3 className="text-sm font-semibold">{t("testTitle")}</h3>
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy !== null} onChange={(e) => void testPhoto(e.target.files?.[0])} className="text-sm" />
          {testResult && (
            <>
              {testResult.tags && <p className="text-xs">{t("aiSaw", { tags: [testResult.tags.garment, ...testResult.tags.colors, testResult.tags.pattern].filter(Boolean).join(" · ") })}</p>}
              <ProductStrip products={testResult.products} />
            </>
          )}
        </div>
        <p className="text-xs text-surface-foreground/60">
          {t("settingsHint")}{" "}
          <Link href="/settings" className="text-brand hover:underline">
            {t("settingsLink")}
          </Link>
        </p>
      </Card>
    </div>
  );
}
