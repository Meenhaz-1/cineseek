import type { ExactTitleDocument } from "./exact-title-index.mjs";

export type TitleTokenRecord = {
  id: string;
  title: string;
  year: number | null;
  genres: string[];
  averageRating: number | null;
  ratingCount: number;
  tags: string[];
  imdbId: string | null;
  tmdbId: number | null;
  posterPath: string | null;
  overview: string;
  cast: string[];
  directors: string[];
};
export type TitleTokenIndex = {
  byToken: Map<string, string[]>;
  records: Map<string, TitleTokenRecord>;
  titleCount: number;
  tokenCount: number;
  postingCount: number;
};
export type TitleTokenLookup = {
  tokens: string[];
  ignoredTokens: string[];
  postings: {
    token: string;
    documentFrequency: number;
    movieIdsPreview: string[];
    truncated: boolean;
  }[];
  candidateIds: string[];
  candidateCount: number;
  candidateIdsPreview: string[];
  intersectionCount: number;
  intersectionIdsPreview: string[];
  candidatesPreview: (TitleTokenRecord | undefined)[];
  truncated: boolean;
};

export function titleTokens(value: unknown): string[];
export function queryTitleTokens(value: unknown): {
  tokens: string[];
  ignoredTokens: string[];
};
export function buildTitleTokenIndex(
  documents: ExactTitleDocument[],
): TitleTokenIndex;
export function lookupTitleTokens(
  index: TitleTokenIndex,
  normalizedQuery: string,
  previewLimit?: number,
): TitleTokenLookup;
