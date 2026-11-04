import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("writes a header row and one row per record", () => {
    const csv = toCsv([{ day: "2026-01-01", revenue: 1250 }], [{ key: "day", header: "Day" }, { key: "revenue", header: "Revenue" }]);
    expect(csv).toBe("Day,Revenue\n2026-01-01,1250");
  });

  it("quotes a field containing a comma", () => {
    const csv = toCsv([{ name: "Rahim, Karim" }], [{ key: "name", header: "Name" }]);
    expect(csv).toBe('Name\n"Rahim, Karim"');
  });

  it("doubles embedded quotes", () => {
    const csv = toCsv([{ name: 'Say "hi"' }], [{ key: "name", header: "Name" }]);
    expect(csv).toBe('Name\n"Say ""hi"""');
  });

  it("renders null/undefined as an empty field", () => {
    const csv = toCsv([{ note: null }], [{ key: "note", header: "Note" }]);
    expect(csv).toBe("Note\n");
  });
});
