"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../components/ui";
import { localizedName, type LocationArea, type LocationDistrict, type LocationDivision, type LocationTree } from "../../../../components/location-picker";

interface Mapping {
  id: string;
  courierProviderInstanceId: string;
  divisionId: string;
  districtId: string;
  areaId: string | null;
  courierAreaCode: string;
  courierAreaName: string | null;
}

interface CourierOption {
  instanceId: string | null;
  driver: string;
  label: string;
}

export default function CourierAreaMappingPage() {
  const t = useTranslations("courierAreaMapping");
  const locale = useLocale();
  const [tree, setTree] = useState<LocationTree>({ divisions: [], districts: [], areas: [] });
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ courierProviderInstanceId: "", divisionId: "", districtId: "", areaId: "", courierAreaCode: "", courierAreaName: "" });

  async function load() {
    try {
      const [m, c, divisions, districts, areas] = await Promise.all([
        api.get<Mapping[]>("/admin/courier-area-mapping"),
        api.get<CourierOption[]>("/admin/couriers/available"),
        api.get<LocationDivision[]>("/store/locations/divisions"),
        api.get<LocationDistrict[]>("/store/locations/districts"),
        api.get<LocationArea[]>("/store/locations/areas"),
      ]);
      setMappings(m);
      setCouriers(c.filter((o) => o.instanceId));
      setTree({ divisions, districts, areas });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, []);

  async function handleAdd() {
    setError(null);
    try {
      await api.post("/admin/courier-area-mapping", {
        courierProviderInstanceId: form.courierProviderInstanceId,
        divisionId: form.divisionId,
        districtId: form.districtId,
        areaId: form.areaId || null,
        courierAreaCode: form.courierAreaCode,
        courierAreaName: form.courierAreaName || null,
      });
      setForm({ courierProviderInstanceId: "", divisionId: "", districtId: "", areaId: "", courierAreaCode: "", courierAreaName: "" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add");
    }
  }

  const nameOf = (rows: { id: string; name: { bn?: string; en?: string } }[], id: string | null) => {
    if (!id) return t("wholeDistrict");
    const row = rows.find((r) => r.id === id);
    return row ? localizedName(row.name, locale) : id;
  };
  const byName = <T extends { name: { bn?: string; en?: string } }>(rows: T[]) => [...rows].sort((a, b) => localizedName(a.name, locale).localeCompare(localizedName(b.name, locale)));
  const districtOptions = byName(tree.districts.filter((d) => d.divisionId === form.divisionId));
  const areaOptions = byName(tree.areas.filter((a) => a.districtId === form.districtId));
  const selectClass = "rounded-theme border border-border bg-surface px-3 py-2 text-sm";

  async function handleRemove(id: string) {
    if (!window.confirm(t("removeConfirm"))) return;
    try {
      await api.delete(`/admin/courier-area-mapping/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      <p className="text-sm text-surface-foreground/70">{t("help")}</p>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <select
            value={form.courierProviderInstanceId}
            onChange={(e) => setForm({ ...form, courierProviderInstanceId: e.target.value })}
            className="rounded-theme border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="">{couriers.length === 0 ? t("noCouriers") : t("chooseCourier")}</option>
            {couriers.map((c) => (
              <option key={c.instanceId} value={c.instanceId!}>
                {c.label || c.driver}
              </option>
            ))}
          </select>
          <select className={selectClass} value={form.divisionId} onChange={(e) => setForm({ ...form, divisionId: e.target.value, districtId: "", areaId: "" })}>
            <option value="">{t("chooseDivision")}</option>
            {byName(tree.divisions).map((d) => (
              <option key={d.id} value={d.id}>{localizedName(d.name, locale)}</option>
            ))}
          </select>
          <select className={selectClass} value={form.districtId} disabled={!form.divisionId} onChange={(e) => setForm({ ...form, districtId: e.target.value, areaId: "" })}>
            <option value="">{t("chooseDistrict")}</option>
            {districtOptions.map((d) => (
              <option key={d.id} value={d.id}>{localizedName(d.name, locale)}</option>
            ))}
          </select>
          <select className={selectClass} value={form.areaId} disabled={!form.districtId} onChange={(e) => setForm({ ...form, areaId: e.target.value })}>
            <option value="">{t("wholeDistrict")}</option>
            {areaOptions.map((a) => (
              <option key={a.id} value={a.id}>{localizedName(a.name, locale)}</option>
            ))}
          </select>
          <TextField label={t("courierAreaCode")} value={form.courierAreaCode} onChange={(e) => setForm({ ...form, courierAreaCode: e.target.value })} />
          <TextField label={t("courierAreaName")} value={form.courierAreaName} onChange={(e) => setForm({ ...form, courierAreaName: e.target.value })} />
        </div>
        <Button onClick={() => void handleAdd()} disabled={!form.courierProviderInstanceId || !form.divisionId || !form.districtId || !form.courierAreaCode}>
          {t("add")}
        </Button>
      </Card>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-surface-foreground/50">
              <th className="px-4 py-3">{t("courier")}</th>
              <th className="px-4 py-3">{t("division")}</th>
              <th className="px-4 py-3">{t("district")}</th>
              <th className="px-4 py-3">{t("area")}</th>
              <th className="px-4 py-3">{t("courierAreaCode")}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-surface-foreground">{(() => {
                    const courier = couriers.find((c) => c.instanceId === m.courierProviderInstanceId);
                    return courier ? courier.label || courier.driver : t("courierRemoved");
                  })()}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{nameOf(tree.divisions, m.divisionId)}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{nameOf(tree.districts, m.districtId)}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{nameOf(tree.areas, m.areaId)}</td>
                <td className="px-4 py-3 font-mono text-surface-foreground">{m.courierAreaCode}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="danger" onClick={() => void handleRemove(m.id)}>
                    ×
                  </Button>
                </td>
              </tr>
            ))}
            {mappings.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-surface-foreground/50" colSpan={6}>
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
