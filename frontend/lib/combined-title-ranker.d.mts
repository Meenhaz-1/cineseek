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
export type GenreWeightKey = "genreFocus" | "bayesianRating" | "ratingEvidence";
export type GenreWeights = Record<GenreWeightKey, number>;
export type CombinedTitleCandidate = TitleTokenRecord & {
  signals: CombinedWeights;
  contributions: CombinedWeights;
  titleScore: number;
  fieldScore: number;
  fieldMatch?: FieldMatchSummary;
  combinedScore: number;
  metadataGenreMatchCount: number;
  genreFocus: number;
  bayesianRating: number;
  ratingEvidence: number;
  structuredGenreSignals: GenreWeights;
  structuredGenreContributions: GenreWeights;
  structuredGenreScore: number;
  isExactTitleMatch: boolean;
};

export const COMBINED_WEIGHT_KEYS: CombinedWeightKey[];
export const DEFAULT_COMBINED_WEIGHTS: CombinedWeights;
export const GENRE_WEIGHT_KEYS: GenreWeightKey[];
export const SINGLE_GENRE_DISCOVERY_WEIGHTS: GenreWeights;
export const COMPOUND_GENRE_DISCOVERY_WEIGHTS: GenreWeights;
export const BAYESIAN_RATING_PRIOR: number;
export function validateCombinedWeights(input?: Partial<CombinedWeights>): {
  weights: CombinedWeights;
  effectiveWeights: CombinedWeights;
  totalWeight: number;
};
export function validateGenreWeights(
  input?: Partial<GenreWeights>,
  defaults?: GenreWeights,
): {
  weights: GenreWeights;
  effectiveWeights: GenreWeights;
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
    structuredGenreRanking?: boolean;
    genreWeights?: Partial<GenreWeights>;
    ratingStats?: {
      ratingVotes: number;
      corpusRatingMean: number;
      maxRatingCount: number;
      ratingById: Map<
        string,
        { bayesianRating: number; ratingEvidence: number }
      >;
    };
  },
): {
  method:
    | "weighted_explainable_title_ranker"
    | "weighted_explainable_multifield_ranker"
    | "weighted_structured_genre_ranker";
  weights: CombinedWeights;
  effectiveWeights: CombinedWeights;
  totalWeight: number;
  rankingContext: {
    requestedGenres: string[];
    genreOverlapPrecedesTitleScore: boolean;
    titleWeight: number;
    fieldWeight: number;
    structuredGenreDiscovery: boolean;
    structuredGenreProfile:
      "single_genre_balanced" | "compound_genre_focus" | null;
    structuredGenreInputWeights: GenreWeights | null;
    structuredGenreWeights: GenreWeights | null;
    structuredGenreWeightTotal: number | null;
    bayesianPrior: number;
  };
  candidateCount: number;
  candidatesPreview: CombinedTitleCandidate[];
  truncated: boolean;
};
