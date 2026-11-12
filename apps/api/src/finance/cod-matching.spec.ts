import { describe, expect, it } from "vitest";
import { expectedCollection, matchCodLine, parseSettlementRows, settlementTotals, takaToPoisha, type MatchableShipment } from "./cod-matching";

describe("takaToPoisha", () => {
  it("parses common courier formats without floating point", () => {
    expect(takaToPoisha("1,250.50")).toBe(125_050);
    expect(takaToPoisha("৳ 70")).toBe(7_000);
    expect(takaToPoisha("Tk. 99.9")).toBe(9_990);
    expect(takaToPoisha("১২০০")).toBe(120_000);
    expect(takaToPoisha("-60")).toBe(-6_000);
    expect(takaToPoisha(".5")).toBe(50);
  });
  it("parses numeric cells", () => {
    expect(takaToPoisha(1250.5)).toBe(125_050);
    expect(takaToPoisha(0.1 + 0.2)).toBe(30);
  });
  it("rounds a third decimal half-up", () => {
    expect(takaToPoisha("10.005")).toBe(1_001);
    expect(takaToPoisha("10.004")).toBe(1_000);
  });
  it("rejects blanks and junk", () => {
    expect(takaToPoisha("")).toBeNull();
    expect(takaToPoisha(null)).toBeNull();
    expect(takaToPoisha("abc")).toBeNull();
    expect(takaToPoisha("1.2.3")).toBeNull();
  });
});

describe("parseSettlementRows", () => {
  it("maps columns case-insensitively and skips empty rows", () => {
    const parsed = parseSettlementRows(
      [
        { "Consignment ID": "C1", "COD Amount": "1,000", Charge: "70" },
        { "Consignment ID": "C2", "COD Amount": 500, Charge: null },
        { "Consignment ID": null, "COD Amount": null, Charge: null },
        { "Consignment ID": "", "COD Amount": "Total", Charge: "" },
        { "Consignment ID": "C3", "COD Amount": "n/a", Charge: "" },
      ],
      { consignmentId: "consignment id", collected: "COD Amount", charge: "Charge" },
    );
    expect(parsed.lines).toEqual([
      { consignmentId: "C1", collected: 100_000, charge: 7_000 },
      { consignmentId: "C2", collected: 50_000, charge: 0 },
    ]);
    expect(parsed.errors).toEqual([
      { row: 4, message: "Missing consignment id" },
      { row: 5, message: "Unreadable collected amount for C3" },
    ]);
  });
});

const delivered: MatchableShipment = { id: "s1", status: "delivered", codAmount: 150_000, deliveryFeeCollected: null, codSettledAt: null };

describe("expectedCollection", () => {
  it("expects the COD amount on delivery and the door fee on rejection", () => {
    expect(expectedCollection(delivered)).toBe(150_000);
    expect(expectedCollection({ ...delivered, status: "rejected_at_door", deliveryFeeCollected: 6_000 })).toBe(6_000);
    expect(expectedCollection({ ...delivered, status: "returned_to_sender" })).toBe(0);
    expect(expectedCollection({ ...delivered, status: "in_transit" })).toBeNull();
  });
});

describe("matchCodLine", () => {
  const line = { consignmentId: "C1", collected: 150_000, charge: 7_000 };
  it("matches cleanly within tolerance", () => {
    expect(matchCodLine({ ...line, collected: 149_950 }, delivered, false, 100)).toEqual({ shipmentId: "s1", matched: true, expected: 150_000, variance: -50, flag: null });
  });
  it("flags a variance beyond tolerance", () => {
    expect(matchCodLine({ ...line, collected: 140_000 }, delivered, false, 100)).toMatchObject({ flag: "variance", variance: -10_000 });
  });
  it("flags unknown consignments", () => {
    expect(matchCodLine(line, null, false, 100)).toEqual({ shipmentId: null, matched: false, expected: null, variance: 0, flag: "unmatched" });
  });
  it("flags duplicates before anything else", () => {
    expect(matchCodLine(line, { ...delivered, codSettledAt: new Date() }, true, 100).flag).toBe("duplicate");
  });
  it("flags shipments already settled by an earlier settlement", () => {
    expect(matchCodLine(line, { ...delivered, codSettledAt: new Date() }, false, 100).flag).toBe("already_settled");
  });
  it("flags money for a shipment we don't consider delivered yet", () => {
    expect(matchCodLine(line, { ...delivered, status: "in_transit" }, false, 100)).toMatchObject({ flag: "not_delivered", variance: 0 });
  });
});

describe("settlementTotals", () => {
  it("sums lines", () => {
    expect(
      settlementTotals([
        { collected: 100_000, charge: 7_000, matched: true, flag: null, variance: 0 },
        { collected: 50_000, charge: 6_000, matched: false, flag: "unmatched", variance: 0 },
        { collected: 10_000, charge: 0, matched: true, flag: "variance", variance: -500 },
      ]),
    ).toEqual({ totalCollected: 160_000, totalCharges: 13_000, netAmount: 147_000, matchedLines: 2, flaggedLines: 2, totalVariance: -500 });
  });
});
