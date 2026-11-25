import { describe, expect, it } from "vitest";
import { banglaSpellings, buildTsQuery, expandTerm, type SynonymRow } from "./search-query";

const panjabiSynonyms: SynonymRow[] = [{ term: "panjabi", synonyms: ["punjabi", "পাঞ্জাবি"] }];

describe("expandTerm", () => {
  it("expands a synonym spelling to the full group, including the canonical term", () => {
    expect(expandTerm("punjabi", panjabiSynonyms)).toEqual(["panjabi", "punjabi", "পাঞ্জাবি"]);
  });

  it("expands the Bangla-script spelling to the same group", () => {
    expect(expandTerm("পাঞ্জাবি", panjabiSynonyms)).toEqual(["panjabi", "punjabi", "পাঞ্জাবি"]);
  });

  it("expands the canonical term itself to the same group", () => {
    expect(expandTerm("panjabi", panjabiSynonyms)).toEqual(["panjabi", "punjabi", "পাঞ্জাবি"]);
  });

  it("is case-insensitive", () => {
    expect(expandTerm("PUNJABI", panjabiSynonyms)).toEqual(["panjabi", "punjabi", "পাঞ্জাবি"]);
  });

  it("returns just the token when no synonym entry matches", () => {
    expect(expandTerm("saree", panjabiSynonyms)).toEqual(["saree"]);
  });
});

describe("buildTsQuery", () => {
  it("builds the same OR-group tsquery regardless of which spelling the shopper typed — the acceptance scenario", () => {
    const fromPunjabi = buildTsQuery("punjabi", panjabiSynonyms);
    const fromPanjabi = buildTsQuery("panjabi", panjabiSynonyms);
    const fromBangla = buildTsQuery("পাঞ্জাবি", panjabiSynonyms);

    expect(fromPunjabi).toBe("(panjabi | punjabi | পাঞ্জাবি)");
    expect(fromPunjabi).toBe(fromPanjabi);
    expect(fromPunjabi).toBe(fromBangla);
  });

  it("ANDs multiple words, each independently expanded", () => {
    expect(buildTsQuery("red punjabi", panjabiSynonyms)).toBe("red & (panjabi | punjabi | পাঞ্জাবি)");
  });

  it("strips tsquery-special characters from a word", () => {
    expect(buildTsQuery("saree & nice", [])).toBe("saree & nice");
  });

  it("returns an empty string for blank input", () => {
    expect(buildTsQuery("   ", panjabiSynonyms)).toBe("");
  });
});

describe("Bangla nukta spellings", () => {
  // "শাড়ি" typed with ড় as one code point (Gboard) vs. ড + nukta (how the product titles are stored).
  const composed = "শাড়ি";
  const decomposed = "শাড়ি";

  it("gives both spellings of a word with a nukta letter, whichever was typed", () => {
    expect(banglaSpellings(composed).sort()).toEqual([composed, decomposed].sort());
    expect(banglaSpellings(decomposed).sort()).toEqual([composed, decomposed].sort());
  });

  it("leaves other words alone", () => {
    expect(banglaSpellings("saree")).toEqual(["saree"]);
    expect(banglaSpellings("জামদানি")).toEqual(["জামদানি"]);
  });

  it("searches both spellings", () => {
    expect(buildTsQuery(composed, [])).toBe(`(${decomposed} | ${composed})`);
  });
});
