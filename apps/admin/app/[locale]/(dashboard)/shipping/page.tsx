"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField, Toggle } from "../../../../components/ui";
import { LocationPicker, describeSelection, type LocationArea, type LocationDistrict, type LocationDivision, type LocationSelection, type LocationTree } from "../../../../components/location-picker";

interface ShippingRate {
  id: string;
  zoneId: string;
  name: { bn?: string; en?: string };
  baseFee: number;
  includedWeightGrams: number;
  extraFeePerStep: number;
  weightStepGrams: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  isActive: boolean;
  position: number;
}

interface ShippingZone {
  id: string;
  name: string;
  priority: number;
  matchDivisionIds: string[];
  matchDistrictIds: string[];
  matchAreaIds: string[];
  matchDhakaCity: boolean;
  isCatchAll: boolean;
  isActive: boolean;
  rates: ShippingRate[];
}

const EMPTY_SELECTION: LocationSelection = { divisionIds: [], districtIds: [], areaIds: [] };

/** Shipping zones & rates editor (docs/PROJECT_SPEC.md §16 M5, §6.4). Matched locations are chosen from the BD location tree (the public read-only `/store/locations` endpoints, so this page needs no `locations.manage` permission); zones can be edited in place. */
export default function ShippingPage() {
  const t = useTranslations("shipping");
  const locale = useLocale();
  const tCommon = useTranslations("common");
  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [zoneName, setZoneName] = useState("");
  const [priority, setPriority] = useState("0");
  const [matchDhakaCity, setMatchDhakaCity] = useState(false);
  const [isCatchAll, setIsCatchAll] = useState(false);
  const [selection, setSelection] = useState<LocationSelection>(EMPTY_SELECTION);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [tree, setTree] = useState<LocationTree>({ divisions: [], districts: [], areas: [] });

  const [rateForm, setRateForm] = useState({ nameEn: "", nameBn: "", baseFee: "", includedWeightGrams: "1000", extraFeePerStep: "0", weightStepGrams: "1000", estimatedDaysMin: "1", estimatedDaysMax: "3" });

  async function load() {
    try {
      setZones(await api.get<ShippingZone[]>("/admin/shipping/zones"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load shipping zones");
    }
  }

  async function loadLocations() {
    try {
      const [divisions, districts, areas] = await Promise.all([
        api.get<LocationDivision[]>("/store/locations/divisions"),
        api.get<LocationDistrict[]>("/store/locations/districts"),
        api.get<LocationArea[]>("/store/locations/areas"),
      ]);
      setTree({ divisions, districts, areas });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load locations");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
    void loadLocations();
  }, []);

  function resetZoneForm() {
    setEditingZoneId(null);
    setZoneName("");
    setPriority("0");
    setMatchDhakaCity(false);
    setIsCatchAll(false);
    setSelection(EMPTY_SELECTION);
  }

  function startEditZone(zone: ShippingZone) {
    setEditingZoneId(zone.id);
    setZoneName(zone.name);
    setPriority(String(zone.priority));
    setMatchDhakaCity(zone.matchDhakaCity);
    setIsCatchAll(zone.isCatchAll);
    setSelection({ divisionIds: zone.matchDivisionIds, districtIds: zone.matchDistrictIds, areaIds: zone.matchAreaIds });
  }

  async function handleSaveZone() {
    const body = {
      name: zoneName,
      priority: Number(priority),
      matchDhakaCity,
      isCatchAll,
      matchAreaIds: selection.areaIds,
      matchDistrictIds: selection.districtIds,
      matchDivisionIds: selection.divisionIds,
    };
    try {
      if (editingZoneId) await api.patch(`/admin/shipping/zones/${editingZoneId}`, body);
      else await api.post("/admin/shipping/zones", body);
      resetZoneForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save zone");
    }
  }

  function zoneSummary(zone: ShippingZone): string {
    const named = describeSelection(tree, { divisionIds: zone.matchDivisionIds, districtIds: zone.matchDistrictIds, areaIds: zone.matchAreaIds }, locale);
    const parts = [
      named.divisions.length ? `${t("matchDivisions")}: ${named.divisions.join(", ")}` : null,
      named.districts.length ? `${t("matchDistricts")}: ${named.districts.join(", ")}` : null,
      named.areas.length ? `${t("matchAreas")}: ${named.areas.join(", ")}` : null,
      zone.matchDhakaCity ? t("matchDhakaCity") : null,
      zone.isCatchAll ? t("isCatchAll") : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : t("matchesNothing");
  }

  async function handleToggleZoneActive(zone: ShippingZone) {
    try {
      await api.patch(`/admin/shipping/zones/${zone.id}`, { isActive: !zone.isActive });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update zone");
    }
  }

  async function handleDeleteZone(id: string) {
    try {
      await api.delete(`/admin/shipping/zones/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete zone");
    }
  }

  async function handleCreateRate(zoneId: string) {
    try {
      await api.post(`/admin/shipping/zones/${zoneId}/rates`, {
        name: { en: rateForm.nameEn, bn: rateForm.nameBn },
        baseFee: Math.round(Number(rateForm.baseFee) * 100),
        includedWeightGrams: Number(rateForm.includedWeightGrams),
        extraFeePerStep: Math.round(Number(rateForm.extraFeePerStep) * 100),
        weightStepGrams: Number(rateForm.weightStepGrams),
        estimatedDaysMin: Number(rateForm.estimatedDaysMin),
        estimatedDaysMax: Number(rateForm.estimatedDaysMax),
      });
      setRateForm({ nameEn: "", nameBn: "", baseFee: "", includedWeightGrams: "1000", extraFeePerStep: "0", weightStepGrams: "1000", estimatedDaysMin: "1", estimatedDaysMax: "3" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create rate");
    }
  }

  async function handleDeleteRate(id: string) {
    try {
      await api.delete(`/admin/shipping/rates/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete rate");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-3">
        {zones.map((zone) => (
          <div key={zone.id} className="rounded-theme border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-surface-foreground">{zone.name}</span>
                <span className="ml-2 text-xs text-surface-foreground/50">
                  {t("priority")} {zone.priority}
                </span>
                <p className="mt-1 text-xs text-surface-foreground/70">{zoneSummary(zone)}</p>
              </div>
              <div className="flex items-center gap-3">
                <Toggle checked={zone.isActive} onChange={() => void handleToggleZoneActive(zone)} />
                <button onClick={() => setExpanded(expanded === zone.id ? null : zone.id)} className="text-xs text-brand underline">
                  {t("rates")} ({zone.rates.length})
                </button>
                <button onClick={() => startEditZone(zone)} className="text-xs text-brand underline">
                  {tCommon("edit")}
                </button>
                <button onClick={() => void handleDeleteZone(zone.id)} className="text-xs text-danger">
                  {tCommon("delete")}
                </button>
              </div>
            </div>

            {expanded === zone.id && (
              <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                {zone.rates.map((rate) => (
                  <div key={rate.id} className="flex items-center justify-between rounded-theme bg-muted px-3 py-2 text-sm">
                    <span>
                      {rate.name.en ?? rate.name.bn} — ৳{(rate.baseFee / 100).toFixed(0)} base, +৳{(rate.extraFeePerStep / 100).toFixed(0)}/{rate.weightStepGrams}g over {rate.includedWeightGrams}g,{" "}
                      {rate.estimatedDaysMin}-{rate.estimatedDaysMax}d
                    </span>
                    <button onClick={() => void handleDeleteRate(rate.id)} className="text-xs text-danger">
                      {tCommon("delete")}
                    </button>
                  </div>
                ))}
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <TextField label={t("rateNameEn")} value={rateForm.nameEn} onChange={(e) => setRateForm((f) => ({ ...f, nameEn: e.target.value }))} />
                  <TextField label={t("rateNameBn")} value={rateForm.nameBn} onChange={(e) => setRateForm((f) => ({ ...f, nameBn: e.target.value }))} />
                  <TextField label={t("baseFee")} type="number" value={rateForm.baseFee} onChange={(e) => setRateForm((f) => ({ ...f, baseFee: e.target.value }))} />
                  <TextField label={t("includedWeight")} type="number" value={rateForm.includedWeightGrams} onChange={(e) => setRateForm((f) => ({ ...f, includedWeightGrams: e.target.value }))} />
                  <TextField label={t("extraFeePerStep")} type="number" value={rateForm.extraFeePerStep} onChange={(e) => setRateForm((f) => ({ ...f, extraFeePerStep: e.target.value }))} />
                  <TextField label={t("weightStep")} type="number" value={rateForm.weightStepGrams} onChange={(e) => setRateForm((f) => ({ ...f, weightStepGrams: e.target.value }))} />
                  <TextField label={t("estimatedDaysMin")} type="number" value={rateForm.estimatedDaysMin} onChange={(e) => setRateForm((f) => ({ ...f, estimatedDaysMin: e.target.value }))} />
                  <TextField label={t("estimatedDaysMax")} type="number" value={rateForm.estimatedDaysMax} onChange={(e) => setRateForm((f) => ({ ...f, estimatedDaysMax: e.target.value }))} />
                  <Button onClick={() => void handleCreateRate(zone.id)} disabled={!rateForm.nameEn || !rateForm.baseFee}>
                    {t("addRate")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {zones.length === 0 && <p className="text-sm text-surface-foreground/50">—</p>}

        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <h2 className="w-full text-sm font-semibold text-surface-foreground">{editingZoneId ? t("editZone") : t("addZone")}</h2>
          <TextField label={t("zoneName")} value={zoneName} onChange={(e) => setZoneName(e.target.value)} />
          <TextField label={t("priority")} type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
          <LocationPicker tree={tree} value={selection} onChange={setSelection} locale={locale} />
          <label className="flex items-center gap-2 text-sm">
            <Toggle checked={matchDhakaCity} onChange={setMatchDhakaCity} /> {t("matchDhakaCity")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Toggle checked={isCatchAll} onChange={setIsCatchAll} /> {t("isCatchAll")}
          </label>
          <Button onClick={() => void handleSaveZone()} disabled={!zoneName}>
            {editingZoneId ? t("saveZone") : t("addZone")}
          </Button>
          {editingZoneId && (
            <Button variant="secondary" onClick={resetZoneForm}>
              {tCommon("cancel")}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
