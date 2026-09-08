import type { QueryPlan } from "../query-planner.mjs";
export type Alias = {
  text: string;
  source: string;
  language: string;
  script: string;
};
export type AliasMatch = {
  id: string;
  name: string;
  score: number;
  alias: Alias;
};
export type HindiPlan = QueryPlan & {
  interpretation: {
    mode: "model" | "fallback" | "exact_alias" | "local_genre";
    dictionaryVersion?: string;
    model?: string;
    fallbackReason?: string;
    cacheHit: boolean;
    usage?: {
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens: number;
    };
    catalogueContext?: {
      type: string;
      name: string;
      alias: string;
      source: string;
      matchedText: string;
      score: number;
    }[];
    originalSpans: { text: string; meaning: string }[];
    matchedAliases: AliasMatch[];
    unresolved: string[];
  };
  multilingual: { blocked: boolean };
};
export type HindiSearchResponse = {
  queryPlan: HindiPlan;
  results: {
    items: {
      id: string;
      title: string;
      year: number | null;
      genres: string[];
      averageRating: number | null;
      ratingCount: number | null;
      score: number;
      matchedAlias: Alias | null;
      matchReason: string;
    }[];
    total: number;
    hasMore: boolean;
    retrievalMs: number;
  };
  coverage: {
    movies: number;
    people: number;
    moviesWithHindi: number;
    peopleWithHindi: number;
  };
  modelEnabled: boolean;
  timings: { plannerMs: number; retrievalMs: number; endToEndMs: number };
};
export type HindiSuggestion = AliasMatch & { type: string; query: string };
export function submittedHindiSearch(
  query: string,
  limit?: number,
): Promise<HindiSearchResponse>;
export function hindiSuggestions(query: string): Promise<HindiSuggestion[]>;
