"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { localized, money, parseTaka, takaInput } from "../../../../lib/format";
import { Banner, Button, Card, TextField } from "../../../../components/ui";
import { MarketingTabs } from "../../../../components/marketing-tabs";
import { Link } from "../../../../i18n/navigation";

interface Tier {
  id: string;
  name: { bn?: string; en?: string };
  minSpent: number;
  earnMultiplierPercent: number;
  perks: { bn?: string; en?: string } | null;
  color: string | null;
  position: number;
  _count: { customers: number };
}

interface Stats {
  enabled: boolean;
  outstandingPoints: number;
  outstandingLiability: number;
  pendingPoints: number;
  membersWithPoints: number;
  earnedLast30Days: number;
  redeemedLast30Days: number;
  tiers: Tier[];
}

const EMPTY = { nameBn: "", nameEn: "", minSpent: "", multiplier: "100", perksBn: "", perksEn: "", color: "" };

/** Loyalty program and tiers (§5.8, §6.12, §16 M13). Earn/redeem rules live in Settings → loyalty. */
export default function LoyaltyPage() {
  const t = useTranslations("loyalty");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [stats, setStats] = useState<Stats | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStats(await api.get<Stats>("/admin/loyalty/stats"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  function edit(tier: Tier) {
    setEditingId(tier.id);
    setForm({
      nameBn: tier.name.bn ?? "",
      nameEn: tier.name.en ?? "",
      minSpent: takaInput(tier.minSpent),
      multiplier: String(tier.earnMultiplierPercent),
      perksBn: tier.perks?.bn ?? "",
      perksEn: tier.perks?.en ?? "",
      color: tier.color ?? "",
    });
  }

  async function save() {
    setError(null);
    const minSpent = parseTaka(form.minSpent);
    if (minSpent === null) return setError(t("invalidAmount"));
    const body = {
      name: { bn: form.nameBn || undefined, en: form.nameEn || undefined },
      minSpent,
      earnMultiplierPercent: Number.parseInt(form.multiplier, 10) || 100,
      perks: form.perksBn || form.perksEn ? { bn: form.perksBn || undefined, en: form.perksEn || undefined } : null,
      color: form.color || null,
      position: 0,
    };
    try {
      if (editingId) await api.put(`/admin/loyalty/tiers/${editingId}`, body);
      else await api.post("/admin/loyalty/tiers", body);
      setForm(EMPTY);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function remove(id: string) {
    try {
      await api.delete(`/admin/loyalty/tiers/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function runSweeps() {
    setNotice(null);
    try {
      await api.post("/admin/loyalty/run-sweeps");
      setNotice(t("sweepsDone"));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <MarketingTabs />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
          <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/settings" className="rounded-theme bg-muted px-4 py-2 text-sm text-surface-foreground">
            {t("rulesInSettings")}
          </Link>
          <Button variant="secondary" onClick={() => void runSweeps()}>
            {t("runSweeps")}
          </Button>
        </div>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}
      {stats && !stats.enabled && <Banner kind="warning">{t("programOff")}</Banner>}

      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            [t("outstandingPoints"), String(stats.outstandingPoints)],
            [t("liability"), money(stats.outstandingLiability)],
            [t("pending"), String(stats.pendingPoints)],
            [t("earned30"), String(stats.earnedLast30Days)],
            [t("redeemed30"), String(stats.redeemedLast30Days)],
          ].map(([label, value]) => (
            <Card key={label} className="p-4">
              <p className="text-xs text-surface-foreground/60">{label}</p>
              <p className="text-xl font-semibold text-surface-foreground">{value}</p>
            </Card>
          ))}
        </div>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-surface-foreground">{t("tiers")}</h2>
        <p className="text-xs text-surface-foreground/60">{t("tiersHelp")}</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-surface-foreground/60">
              <th className="py-1">{t("tierName")}</th>
              <th>{t("minSpent")}</th>
              <th>{t("multiplier")}</th>
              <th>{t("members")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {stats?.tiers.map((tier) => (
              <tr key={tier.id} className="border-t border-border">
                <td className="py-2">
                  {tier.color && <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ backgroundColor: tier.color }} />}
                  {localized(tier.name, locale)}
                </td>
                <td>{money(tier.minSpent)}</td>
                <td>{(tier.earnMultiplierPercent / 100).toFixed(2)}×</td>
                <td>{tier._count.customers}</td>
                <td className="flex justify-end gap-3 py-2">
                  <button className="text-xs text-brand" onClick={() => edit(tier)}>
                    {tCommon("edit")}
                  </button>
                  <button className="text-xs text-danger" onClick={() => void remove(tier.id)}>
                    {tCommon("delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid grid-cols-1 gap-3 border-t border-border pt-3 md:grid-cols-3">
          <TextField label={t("nameBn")} value={form.nameBn} onChange={(e) => setForm({ ...form, nameBn: e.target.value })} />
          <TextField label={t("nameEn")} value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
          <TextField label={t("minSpentTaka")} value={form.minSpent} onChange={(e) => setForm({ ...form, minSpent: e.target.value })} inputMode="decimal" />
          <TextField label={t("multiplierPercent")} value={form.multiplier} onChange={(e) => setForm({ ...form, multiplier: e.target.value })} inputMode="numeric" />
          <TextField label={t("perksBn")} value={form.perksBn} onChange={(e) => setForm({ ...form, perksBn: e.target.value })} />
          <TextField label={t("perksEn")} value={form.perksEn} onChange={(e) => setForm({ ...form, perksEn: e.target.value })} />
          <TextField label={t("color")} value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="#C9A227" />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void save()} disabled={!form.nameBn && !form.nameEn}>
            {editingId ? tCommon("save") : t("addTier")}
          </Button>
          {editingId && (
            <Button
              variant="secondary"
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY);
              }}
            >
              {tCommon("cancel")}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
