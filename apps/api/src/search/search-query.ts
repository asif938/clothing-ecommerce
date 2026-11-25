/**
 * Postgres FTS + editable Banglish synonyms (docs/PROJECT_SPEC.md §16 M2):
 * "search finds 'punjabi', 'panjabi' and 'পাঞ্জাবি' for a product titled
 * Panjabi with a synonym entry." `products.search_document` is built with
 * the 'simple' tsvector config (no stemming — see migration.sql), so a
 * query for any spelling in a synonym group only matches the product's
 * literal title token ("panjabi") if the *query* is expanded to include it
 * too. That expansion is what this module does, kept DB-free so the
 * term→group mapping is unit-testable without Postgres.
 */
export interface SynonymRow {
  term: string;
  synonyms: string[];
}

/**
 * Bangla letters with a nukta have two Unicode spellings that look the same:
 * one code point (ড় U+09DC, ঢ় U+09DD, য় U+09DF) or the base letter + nukta
 * (ড U+09A1 + ় U+09BC, …). Keyboards differ — Gboard types the single code
 * point, while NFC (and most stored text) uses the pair — and the search index
 * treats them as different words, so "শাড়ি" missed every saree. Each search
 * word is tried in both spellings.
 */
const NUKTA_PAIRS: [composed: string, decomposed: string][] = [
  ["\u09DC", "\u09A1\u09BC"],
  ["\u09DD", "\u09A2\u09BC"],
  ["\u09DF", "\u09AF\u09BC"],
];

/** The same Bangla word in both nukta spellings (just the word when it has none). */
export function banglaSpellings(word: string): string[] {
  const decomposed = NUKTA_PAIRS.reduce((w, [one, pair]) => w.split(one).join(pair), word.normalize("NFC"));
  const composed = NUKTA_PAIRS.reduce((w, [one, pair]) => w.split(pair).join(one), decomposed);
  return [...new Set([decomposed, composed])];
}

/** Strip characters with special meaning to Postgres's tsquery parser. */
function escapeTsQueryWord(word: string): string {
  return word.replace(/[&|!():*']/g, "");
}

/** All spellings in the same group as `token` (itself included), via an exact case-insensitive match on the term or any synonym. */
export function expandTerm(token: string, synonyms: SynonymRow[]): string[] {
  const lower = token.toLowerCase();
  const row = synonyms.find((s) => s.term.toLowerCase() === lower || s.synonyms.some((syn) => syn.toLowerCase() === lower));
  if (!row) return [token];
  return [row.term, ...row.synonyms];
}

/** Tokenize on whitespace, expand each word through the synonym table, AND across words / OR within a word's synonym group. */
export function buildTsQuery(rawQuery: string, synonyms: SynonymRow[]): string {
  const tokens = rawQuery.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";

  return tokens
    .map((token) => {
      const group = [...new Set(expandTerm(token, synonyms).flatMap(banglaSpellings))].map(escapeTsQueryWord).filter(Boolean);
      if (group.length === 0) return null;
      return group.length === 1 ? group[0] : `(${group.join(" | ")})`;
    })
    .filter((clause): clause is string => !!clause)
    .join(" & ");
}
