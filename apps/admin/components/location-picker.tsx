"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

type Localized = { bn?: string; en?: string };
export interface LocationDivision { id: string; name: Localized }
export interface LocationDistrict { id: string; divisionId: string; name: Localized }
export interface LocationArea { id: string; districtId: string; name: Localized; isDhakaCity: boolean }

export interface LocationTree {
  divisions: LocationDivision[];
  districts: LocationDistrict[];
  areas: LocationArea[];
}

export interface LocationSelection {
  divisionIds: string[];
  districtIds: string[];
  areaIds: string[];
}

export function localizedName(name: Localized, locale: string): string {
  return (locale === "bn" ? name.bn || name.en : name.en || name.bn) ?? "";
}

/** Resolves stored ids to display names; an id that no longer resolves (deleted/inactive area) is shown as-is rather than dropped. */
export function describeSelection(tree: LocationTree, selection: LocationSelection, locale: string) {
  const byId = <T extends { id: string; name: Localized }>(rows: T[], ids: string[]) =>
    ids.map((id) => {
      const row = rows.find((r) => r.id === id);
      return row ? localizedName(row.name, locale) : id;
    });
  return {
    divisions: byId(tree.divisions, selection.divisionIds),
    districts: byId(tree.districts, selection.districtIds),
    areas: byId(tree.areas, selection.areaIds),
  };
}

function Chip({ label, onRemove, removeLabel }: { label: string; onRemove: () => void; removeLabel: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-surface-foreground">
      {label}
      <button type="button" onClick={onRemove} aria-label={`${removeLabel} ${label}`} className="text-surface-foreground/60 hover:text-danger">
        ×
      </button>
    </span>
  );
}

const selectClass = "rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground outline-none focus:border-brand";

/**
 * Division / district / area multi-select for shipping zones — replaces
 * typing raw location ids. Each level is independent (a zone can match some
 * whole divisions, some whole districts and some single areas at once);
 * checkout picks the most specific match, so the hint spells that out.
 */
export function LocationPicker({ tree, value, onChange, locale }: { tree: LocationTree; value: LocationSelection; onChange: (next: LocationSelection) => void; locale: string }) {
  const t = useTranslations("shipping");
  const [areaDistrictId, setAreaDistrictId] = useState("");
  const name = (n: Localized) => localizedName(n, locale);
  const sortByName = <T extends { name: Localized }>(rows: T[]) => [...rows].sort((a, b) => name(a.name).localeCompare(name(b.name)));

  const districtsByDivision = useMemo(
    () => sortByName(tree.divisions).map((division) => ({ division, districts: sortByName(tree.districts.filter((d) => d.divisionId === division.id)) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sortByName only depends on locale
    [tree, locale],
  );
  const areasOfDistrict = useMemo(() => sortByName(tree.areas.filter((a) => a.districtId === areaDistrictId)), [tree, areaDistrictId]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (key: keyof LocationSelection, id: string) => {
    if (!id || value[key].includes(id)) return;
    onChange({ ...value, [key]: [...value[key], id] });
  };
  const remove = (key: keyof LocationSelection, id: string) => onChange({ ...value, [key]: value[key].filter((x) => x !== id) });

  const label = (rows: { id: string; name: Localized }[], id: string) => {
    const row = rows.find((r) => r.id === id);
    return row ? name(row.name) : id;
  };
  const areaLabel = (id: string) => {
    const area = tree.areas.find((a) => a.id === id);
    if (!area) return id;
    const district = tree.districts.find((d) => d.id === area.districtId);
    return district ? `${name(area.name)} (${name(district.name)})` : name(area.name);
  };

  return (
    <div className="flex w-full flex-col gap-4 rounded-theme border border-border p-4">
      <p className="text-xs text-surface-foreground/60">{t("pickerHint")}</p>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-surface-foreground">{t("matchDivisions")}</span>
        <div className="flex flex-wrap gap-1.5">
          {value.divisionIds.map((id) => (
            <Chip key={id} label={label(tree.divisions, id)} onRemove={() => remove("divisionIds", id)} removeLabel={t("remove")} />
          ))}
        </div>
        <select className={selectClass} value="" onChange={(e) => add("divisionIds", e.target.value)} aria-label={t("addDivision")}>
          <option value="">{t("addDivision")}</option>
          {sortByName(tree.divisions).filter((d) => !value.divisionIds.includes(d.id)).map((d) => (
            <option key={d.id} value={d.id}>{name(d.name)}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-surface-foreground">{t("matchDistricts")}</span>
        <div className="flex flex-wrap gap-1.5">
          {value.districtIds.map((id) => (
            <Chip key={id} label={label(tree.districts, id)} onRemove={() => remove("districtIds", id)} removeLabel={t("remove")} />
          ))}
        </div>
        <select className={selectClass} value="" onChange={(e) => add("districtIds", e.target.value)} aria-label={t("addDistrict")}>
          <option value="">{t("addDistrict")}</option>
          {districtsByDivision.map(({ division, districts }) => (
            <optgroup key={division.id} label={name(division.name)}>
              {districts.filter((d) => !value.districtIds.includes(d.id)).map((d) => (
                <option key={d.id} value={d.id}>{name(d.name)}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-surface-foreground">{t("matchAreas")}</span>
        <div className="flex flex-wrap gap-1.5">
          {value.areaIds.map((id) => (
            <Chip key={id} label={areaLabel(id)} onRemove={() => remove("areaIds", id)} removeLabel={t("remove")} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <select className={selectClass} value={areaDistrictId} onChange={(e) => setAreaDistrictId(e.target.value)} aria-label={t("chooseDistrictForArea")}>
            <option value="">{t("chooseDistrictForArea")}</option>
            {districtsByDivision.map(({ division, districts }) => (
              <optgroup key={division.id} label={name(division.name)}>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>{name(d.name)}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <select className={selectClass} value="" disabled={!areaDistrictId} onChange={(e) => add("areaIds", e.target.value)} aria-label={t("addArea")}>
            <option value="">{t("addArea")}</option>
            {areasOfDistrict.filter((a) => !value.areaIds.includes(a.id)).map((a) => (
              <option key={a.id} value={a.id}>
                {name(a.name)}{a.isDhakaCity ? ` · ${t("dhakaCityTag")}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
