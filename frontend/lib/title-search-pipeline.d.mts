import type {
  ExactTitleDocument,
  ExactTitleIndex,
} from "./exact-title-index.mjs";
import type { TitleTokenIndex } from "./title-token-index.mjs";
import type { CharacterTrigramIndex } from "./character-trigram-index.mjs";
import type { FieldAwareIndex, FieldMatch } from "./field-aware-index.mjs";
import type {
  CombinedWeights,
  GenreWeights,
} from "./combined-title-ranker.mjs";
import type { MetadataFilters } from "./metadata-query.mjs";
import type { QueryPlan } from "./query-planner.mjs";

export type TitleSearchPipeline = {
  exact: ExactTitleIndex;
  tokens: TitleTokenIndex;
  fields: FieldAwareIndex;
  trigrams: CharacterTrigramIndex;
  ratingStats: {
    ratingVotes: number;
    corpusRatingMean: number;
    maxRatingCount: number;
    ratingById: Map<string, { bayesianRating: number; ratingEvidence: number }>;
  };
  buildMs: number;
};
export type TitleSearchInput = {
  normalizedQuery: string;
  retrievalQuery: string;
  fieldQuery?: string;
  genreTitleFallbackQuery?: string;
  weights?: Partial<CombinedWeights>;
  filters?: MetadataFilters;
};
export type TitleSearchPipelineResult = Record<string, unknown> & {
  timings: {
    exactLookupMs: number;
    metadataFilterMs: number;
    tokenLookupMs: number;
    fieldLookupMs: number;
    trigramLookupMs: number;
    candidateMergeMs: number;
    scoringMs: number;
    totalMs: number;
  };
  evaluation: {
    candidateIds: string[];
    rankedResults: {
      id: string;
      title: string;
      year: number | null;
      score: number;
      titleScore?: number;
      fieldScore?: number;
      matchReason?: Partial<FieldMatch>;
    }[];
  };
};

export function buildTitleSearchPipeline(
  documents: ExactTitleDocument[],
): TitleSearchPipeline;
export function loadTitleSearchPipeline(
  corpusPath: string,
): Promise<TitleSearchPipeline>;
export function runTitleSearch(
  pipeline: TitleSearchPipeline,
  input: TitleSearchInput | QueryPlan,
  options?: {
    previewLimit?: number;
    rankLimit?: number;
    cacheStatus?: string;
    weights?: Partial<CombinedWeights>;
    genreWeights?: Partial<GenreWeights>;
  },
): TitleSearchPipelineResult;
export function publicTitleSearchResult(
  result: TitleSearchPipelineResult,
): Omit<TitleSearchPipelineResult, "evaluation">;
