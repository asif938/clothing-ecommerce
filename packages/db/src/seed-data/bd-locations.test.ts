import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface BdLocationsFile {
  divisions: { code: string; nameBn: string; nameEn: string }[];
  districts: { code: string; divisionCode: string; nameBn: string; nameEn: string }[];
  areas: {
    districtCode: string;
    nameBn: string;
    nameEn: string;
    type: "upazila" | "thana" | "city_area";
    isDhakaCity: boolean;
    postcode: string | null;
  }[];
}

const data = JSON.parse(
  readFileSync(join(__dirname, "bd-locations.json"), "utf8"),
) as BdLocationsFile;

describe("bd-locations.json", () => {
  it("has exactly the 8 divisions and 64 districts of Bangladesh", () => {
    expect(data.divisions).toHaveLength(8);
    expect(data.districts).toHaveLength(64);
  });

  it("gives every division and district a unique code and both Bangla and English names", () => {
    const divisionCodes = data.divisions.map((d) => d.code);
    expect(new Set(divisionCodes).size).toBe(divisionCodes.length);
    for (const division of data.divisions) {
      expect(division.nameBn, division.code).toBeTruthy();
      expect(division.nameEn, division.code).toBeTruthy();
    }

    const districtCodes = data.districts.map((d) => d.code);
    expect(new Set(districtCodes).size).toBe(districtCodes.length);
    for (const district of data.districts) {
      expect(district.nameBn, district.code).toBeTruthy();
      expect(district.nameEn, district.code).toBeTruthy();
    }
  });

  it("points every district at a division that exists", () => {
    const divisionCodes = new Set(data.divisions.map((d) => d.code));
    for (const district of data.districts) {
      expect(divisionCodes.has(district.divisionCode), `district "${district.code}"`).toBe(true);
    }
  });

  it("points every area at a district that exists, with bn/en names", () => {
    const districtCodes = new Set(data.districts.map((d) => d.code));
    for (const area of data.areas) {
      expect(districtCodes.has(area.districtCode), `area "${area.nameEn}"`).toBe(true);
      expect(area.nameBn, area.nameEn).toBeTruthy();
      expect(area.nameEn).toBeTruthy();
      expect(["upazila", "thana", "city_area"]).toContain(area.type);
    }
  });

  it("gives every district at least one area", () => {
    const districtsWithAreas = new Set(data.areas.map((a) => a.districtCode));
    for (const district of data.districts) {
      expect(districtsWithAreas.has(district.code), `district "${district.code}" has no areas`).toBe(true);
    }
  });

  it("marks Dhaka city areas correctly and keeps them in the Dhaka district", () => {
    const dhakaCityAreas = data.areas.filter((a) => a.isDhakaCity);
    expect(dhakaCityAreas.length).toBeGreaterThan(0);
    for (const area of dhakaCityAreas) {
      expect(area.districtCode).toBe("DHA-DHAKA");
      expect(area.type).toBe("city_area");
    }
  });

  it("produces unique (districtCode + slug(nameEn)) seed keys", () => {
    const slugify = (value: string) =>
      value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const keys = data.areas.map((a) => `${a.districtCode}-${slugify(a.nameEn)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
