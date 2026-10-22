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
      const group = [...new Set(expandTerm(token, synonyms))].map(escapeTsQueryWord).filter(Boolean);
      if (group.length === 0) return null;
      return group.length === 1 ? group[0] : `(${group.join(" | ")})`;
    })
    .filter((clause): clause is string => !!clause)
    .join(" & ");
}
