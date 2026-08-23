import type { TitleTokenRecord } from "./title-token-index.mjs";
import type { FieldMatchSummary } from "./field-aware-index.mjs";

export type CombinedWeightKey =
  | "tokenCoverage"
  | "orderedCoverage"
  | "phraseMatch"
  | "proximity"
  | "dice"
  | "editSimilarity";
export type CombinedWeights = Record<CombinedWeightKey, number>;
export type CombinedTitleCandidate = TitleTokenRecord & {
  signals: CombinedWeights;
  contributions: CombinedWeights;
  titleScore: number;
  fieldScore: number;
  fieldMatch?: FieldMatchSummary;
  combinedScore: number;
  metadataGenreMatchCount: number;
  isExactTitleMatch: boolean;
};

export const COMBINED_WEIGHT_KEYS: CombinedWeightKey[];
export const DEFAULT_COMBINED_WEIGHTS: CombinedWeights;
export function validateCombinedWeights(input?: Partial<CombinedWeights>): {
  weights: CombinedWeights;
  effectiveWeights: CombinedWeights;
  totalWeight: number;
};
export function scoreCombinedTitleCandidate(
  record: TitleTokenRecord,
  normalizedQuery: string,
  queryTrigrams: string[],
  effectiveWeights: CombinedWeights,
): CombinedTitleCandidate;
export function scoreCombinedTitleCandidates(
  records: Map<string, TitleTokenRecord>,
  candidateIds: string[],
  normalizedQuery: string,
  inputWeights?: Partial<CombinedWeights>,
  previewLimit?: number,
  rankingContext?: {
    genres?: string[];
    fieldMatches?: Map<string, FieldMatchSummary>;
    exactTitleIds?: Set<string>;
    genreFallbackCandidateIds?: Set<string>;
    genreFallbackQuery?: string;
  },
): {
  method:
    | "weighted_explainable_title_ranker"
    | "weighted_explainable_multifield_ranker";
  weights: CombinedWeights;
  effectiveWeights: CombinedWeights;
  totalWeight: number;
  rankingContext: {
    requestedGenres: string[];
    genreOverlapPrecedesTitleScore: boolean;
    titleWeight: number;
    fieldWeight: number;
  };
  candidateCount: number;
  candidatesPreview: CombinedTitleCandidate[];
  truncated: boolean;
};
