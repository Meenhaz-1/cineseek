import type { TitleTokenRecord } from "./title-token-index.mjs";

export type SearchableField =
  "cast" | "directors" | "genres" | "tags" | "overview";
export type FieldMatch = {
  field: SearchableField;
  label: string;
  value: string;
  matchType: "exact_value" | "phrase" | "token_coverage";
  matchedTokens: string[];
  coverage: number;
  score: number;
  exactEntityMatch: boolean;
};
export type FieldMatchSummary = {
  score: number;
  exactEntityMatch: boolean;
  bestMatch: FieldMatch;
  matches: FieldMatch[];
};
export type FieldAwareIndex = {
  fields: Record<SearchableField, Map<string, string[]>>;
  records: Map<string, TitleTokenRecord>;
  preparedById: Map<
    string,
    Record<
      SearchableField,
      { values: { source: string; normalized: string }[]; tokens: Set<string> }
    >
  >;
  postingCount: number;
};

export const SEARCHABLE_FIELD_WEIGHTS: Record<SearchableField, number>;
export function buildFieldAwareIndex(
  records: Map<string, TitleTokenRecord>,
): FieldAwareIndex;
export function lookupFieldAware(
  index: FieldAwareIndex,
  queryText: string,
  previewLimit?: number,
  options?: { allowedFields?: SearchableField[] },
): {
  tokens: string[];
  ignoredTokens: string[];
  postings: {
    field: SearchableField;
    token: string;
    documentFrequency: number;
  }[];
  candidateIds: string[];
  candidateCount: number;
  matchesById: Map<string, FieldMatchSummary>;
  candidatesPreview: (TitleTokenRecord & { fieldMatch: FieldMatchSummary })[];
  truncated: boolean;
};
